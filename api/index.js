import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import { put, del, head } from '@vercel/blob';

const PROJECTS_BLOB_PATH = 'data/projects.json';
const MAX_ZIP_ENTRIES = 50;
const MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100MB total across extracted files

function sanitizeFilename(name) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function uniqueFileName(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const base = sanitizeFilename(path.basename(originalName, ext));
  return `${base}_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.html' || ext === '.zip') cb(null, true);
    else cb(new Error('Solo se permiten archivos .html o .zip'));
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

async function readProjects() {
  try {
    const blob = await head(PROJECTS_BLOB_PATH);
    // Cache-bust: Vercel Blob's default cache-control is one month, and this
    // pathname gets overwritten on every write, so an uncached query param
    // is required or reads can serve stale data right after a write.
    const res = await fetch(`${blob.url}?v=${Date.now()}`, { cache: 'no-store' });
    return await res.json();
  } catch {
    return [];
  }
}

async function writeProjects(projects) {
  await put(PROJECTS_BLOB_PATH, JSON.stringify(projects, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

// Extracts .html entries from a zip buffer and uploads each to Blob storage.
// Rejects zips with too many entries or too much uncompressed data (zip-bomb guard).
async function extractAndUploadZip(buffer) {
  const zip = new AdmZip(buffer);
  const htmlEntries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.html'));

  if (htmlEntries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`El ZIP contiene demasiados archivos HTML (máximo ${MAX_ZIP_ENTRIES})`);
  }
  const totalSize = htmlEntries.reduce((sum, e) => sum + e.header.size, 0);
  if (totalSize > MAX_ZIP_UNCOMPRESSED_BYTES) {
    throw new Error('El contenido descomprimido del ZIP excede el límite permitido');
  }

  const uploaded = [];
  for (const entry of htmlEntries) {
    const fileName = uniqueFileName(path.basename(entry.entryName));
    const blob = await put(`uploads/${fileName}`, entry.getData(), {
      access: 'public',
      contentType: 'text/html; charset=utf-8',
    });
    uploaded.push({ fileName, url: blob.url });
  }
  return uploaded;
}

const app = express();
app.use(cors());
app.use(express.json());

// GET /api/projects
app.get('/api/projects', async (_req, res) => {
  res.json(await readProjects());
});

// GET /api/projects/:id
app.get('/api/projects/:id', async (req, res) => {
  const projects = await readProjects();
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
  res.json(project);
});

// POST /api/projects
app.post('/api/projects', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se ha proporcionado ningún archivo' });
  }

  const { originalname, buffer } = req.file;
  const ext = path.extname(originalname).toLowerCase();
  let uploadedFiles;

  try {
    if (ext === '.zip') {
      uploadedFiles = await extractAndUploadZip(buffer);
    } else {
      const fileName = uniqueFileName(originalname);
      const blob = await put(`uploads/${fileName}`, buffer, {
        access: 'public',
        contentType: 'text/html; charset=utf-8',
      });
      uploadedFiles = [{ fileName: originalname, url: blob.url }];
    }
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Error al procesar el archivo' });
  }

  if (uploadedFiles.length === 0) {
    return res.status(400).json({ error: 'El ZIP no contiene archivos HTML' });
  }

  const responsible = req.body.responsible || 'Anónimo';
  const tags = req.body.tags ? req.body.tags.split(',').map((t) => t.trim()) : [];
  const now = new Date().toISOString();
  const projects = await readProjects();

  const newProjects = uploadedFiles.map(({ fileName, url }) => ({
    id: uuidv4(),
    nombre: fileName,
    fecha_creacion: req.body.fecha_creacion || now,
    fecha_subida: now,
    responsable: responsible,
    ruta: url,
    etiquetas: tags,
  }));

  projects.push(...newProjects);
  await writeProjects(projects);
  res.status(201).json(newProjects);
});

// DELETE /api/projects/:id
app.delete('/api/projects/:id', async (req, res) => {
  const projects = await readProjects();
  const index = projects.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Proyecto no encontrado' });

  const [project] = projects.splice(index, 1);
  await writeProjects(projects);
  try {
    await del(project.ruta);
  } catch {
    // Blob may already be gone, ignore
  }
  res.json({ message: 'Proyecto eliminado', id: project.id });
});

export default app;
