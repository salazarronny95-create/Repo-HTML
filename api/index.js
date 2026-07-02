import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = '/tmp/uploads';
const dataFile = '/tmp/projects.json';

// Ensure /tmp directories exist
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, '[]', 'utf-8');

function sanitizeFilename(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext);
    const sanitized = sanitizeFilename(baseName);
    const timestamp = Date.now();
    const uniqueId = uuidv4().slice(0, 8);
    cb(null, `${sanitized}_${timestamp}_${uniqueId}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.html' || ext === '.zip') cb(null, true);
  else cb(new Error('Solo se permiten archivos .html o .zip'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

function readProjects() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  } catch {
    return [];
  }
}

function writeProjects(projects) {
  fs.writeFileSync(dataFile, JSON.stringify(projects, null, 2), 'utf-8');
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploaded files
app.use('/uploads', (req, res, next) => {
  const filePath = path.join(uploadsDir, req.path);
  if (fs.existsSync(filePath) && filePath.endsWith('.html')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
  }
  next();
}, express.static(uploadsDir));

// GET /api/projects
app.get('/api/projects', (_req, res) => {
  res.json(readProjects());
});

// GET /api/projects/:id
app.get('/api/projects/:id', (req, res) => {
  const projects = readProjects();
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
  res.json(project);
});

// POST /api/projects
app.post('/api/projects', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se ha proporcionado ningún archivo' });
  }

  const file = req.file;
  const ext = path.extname(file.originalname).toLowerCase();
  let savedFiles = [];

  if (ext === '.zip') {
    try {
      const zip = new AdmZip(file.path);
      const zipEntries = zip.getEntries();
      for (const entry of zipEntries) {
        if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.html')) {
          const extractedPath = path.join(uploadsDir, sanitizeFilename(entry.entryName));
          zip.extractEntryTo(entry, uploadsDir, false, true);
          const timestamp = Date.now();
          const uniqueId = uuidv4().slice(0, 8);
          const ext2 = path.extname(extractedPath);
          const base = path.basename(extractedPath, ext2);
          const newPath = path.join(uploadsDir, `${base}_${timestamp}_${uniqueId}${ext2}`);
          if (fs.existsSync(extractedPath)) {
            fs.renameSync(extractedPath, newPath);
            savedFiles.push(newPath);
          }
        }
      }
      try { fs.unlinkSync(file.path); } catch {}
    } catch (err) {
      return res.status(400).json({ error: 'Error al procesar el archivo ZIP' });
    }
  } else {
    savedFiles = [file.path];
  }

  const responsible = req.body.responsible || 'Anónimo';
  const tags = req.body.tags ? req.body.tags.split(',').map((t) => t.trim()) : [];
  const now = new Date().toISOString();
  const projects = readProjects();

  const newProjects = savedFiles.map((filePath) => {
    const fileName = path.basename(filePath);
    return {
      id: uuidv4(),
      nombre: fileName,
      fecha_creacion: req.body.fecha_creacion || now,
      fecha_subida: now,
      responsable: responsible,
      ruta: `/uploads/${fileName}`,
      etiquetas: tags,
    };
  });

  projects.push(...newProjects);
  writeProjects(projects);
  res.status(201).json(newProjects);
});

// DELETE /api/projects/:id
app.delete('/api/projects/:id', (req, res) => {
  const projects = readProjects();
  const index = projects.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Proyecto no encontrado' });
  const [project] = projects.splice(index, 1);
  writeProjects(projects);
  const filePath = path.join(uploadsDir, path.basename(project.ruta));
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
  res.json({ message: 'Proyecto eliminado', id: project.id });
});

export default app;