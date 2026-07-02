import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { upload, extractZipIfNeeded } from '../middleware/upload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'projects.json');
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Ensure directories exist
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function readProjects() {
  try {
    if (!fs.existsSync(dataFile)) return [];
    return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  } catch {
    return [];
  }
}

function writeProjects(projects) {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(projects, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing projects.json:', err);
  }
}

export const projectsRouter = Router();

// GET /api/projects — list all projects
projectsRouter.get('/projects', (_req, res) => {
  const projects = readProjects();
  res.json(projects);
});

// GET /api/projects/:id — get single project
projectsRouter.get('/projects/:id', (req, res) => {
  const projects = readProjects();
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
  res.json(project);
});

// POST /api/projects — upload a file
projectsRouter.post('/projects', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se ha proporcionado ningún archivo' });
  }

  const file = req.file;
  const ext = path.extname(file.originalname).toLowerCase();
  let savedFiles = [];

  if (ext === '.zip') {
    savedFiles = extractZipIfNeeded(file.path, uploadsDir);
  } else {
    savedFiles = [file.path];
  }

  const responsible = req.body.responsible || 'Anónimo';
  const tags = req.body.tags ? req.body.tags.split(',').map((t) => t.trim()) : [];
  const now = new Date().toISOString();
  const projects = readProjects();

  const newProjects = savedFiles.map((filePath) => {
    const fileName = path.basename(filePath);
    const originalName = ext === '.zip' ? fileName : req.file.originalname;
    return {
      id: uuidv4(),
      nombre: originalName,
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

// DELETE /api/projects/:id — delete a project
projectsRouter.delete('/projects/:id', (req, res) => {
  const projects = readProjects();
  const index = projects.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Proyecto no encontrado' });

  const [project] = projects.splice(index, 1);
  writeProjects(projects);

  // Try to delete the file
  const filePath = path.join(uploadsDir, path.basename(project.ruta));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // File may not exist, ignore
  }

  res.json({ message: 'Proyecto eliminado', id: project.id });
});