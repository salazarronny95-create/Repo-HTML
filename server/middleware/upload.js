import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function sanitizeFilename(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
    .replace(/_{2,}/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, '') // Trim leading/trailing underscores
    .toLowerCase();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
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
  if (ext === '.html' || ext === '.zip') {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos .html o .zip'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

export function extractZipIfNeeded(filePath, extractToDir) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.zip') return [filePath];

  const zip = new AdmZip(filePath);
  const zipEntries = zip.getEntries();
  const htmlFiles = [];

  for (const entry of zipEntries) {
    if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.html')) {
      const extractedPath = path.join(extractToDir, sanitizeFilename(entry.entryName));
      zip.extractEntryTo(entry, extractToDir, false, true);
      // Rename with timestamp to avoid collisions
      const timestamp = Date.now();
      const uniqueId = uuidv4().slice(0, 8);
      const ext2 = path.extname(extractedPath);
      const base = path.basename(extractedPath, ext2);
      const newPath = path.join(extractToDir, `${base}_${timestamp}_${uniqueId}${ext2}`);
      fs.renameSync(extractedPath, newPath);
      htmlFiles.push(newPath);
    }
  }

  // Clean up the zip file
  fs.unlinkSync(filePath);
  return htmlFiles;
}