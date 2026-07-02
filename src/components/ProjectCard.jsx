import { Eye, Download, Trash2, File, FileArchive, Clock, User, Tag } from 'lucide-react';
import { formatDate } from '../utils/sanitize.js';
import './ProjectCard.css';

export default function ProjectCard({ project, onPreview, onDownload, onDelete }) {
  const isZip = project.nombre.toLowerCase().endsWith('.zip');
  const previewUrl = isZip ? null : project.ruta;

  return (
    <article className="project-card m3-card animate-in">
      <div className="project-card__icon-row">
        <div className={`project-card__icon ${isZip ? 'project-card__icon--zip' : ''}`}>
          {isZip ? <FileArchive size={22} /> : <File size={22} />}
        </div>
        <span className={`project-card__badge ${isZip ? 'project-card__badge--zip' : ''}`}>
          {isZip ? 'ZIP' : 'HTML'}
        </span>
      </div>

      <h3 className="project-card__title" title={project.nombre}>
        {project.nombre}
      </h3>

      <div className="project-card__meta">
        <div className="project-card__meta-item">
          <Clock size={14} />
          <span>Subido: {formatDate(project.fecha_subida)}</span>
        </div>
        {project.fecha_creacion && (
          <div className="project-card__meta-item">
            <Clock size={14} />
            <span>Creado: {formatDate(project.fecha_creacion)}</span>
          </div>
        )}
        <div className="project-card__meta-item">
          <User size={14} />
          <span>{project.responsable}</span>
        </div>
        {project.etiquetas?.length > 0 && (
          <div className="project-card__meta-item project-card__tags">
            <Tag size={14} />
            <span>{project.etiquetas.join(', ')}</span>
          </div>
        )}
      </div>

      <div className="project-card__actions">
        {previewUrl && (
          <button
            className="m3-button m3-button--tonal m3-button--icon project-card__action-btn"
            onClick={() => onPreview(project)}
            title="Vista previa"
            aria-label={`Vista previa de ${project.nombre}`}
          >
            <Eye size={18} />
          </button>
        )}
        <button
          className="m3-button m3-button--outlined m3-button--icon project-card__action-btn"
          onClick={() => onDownload(project)}
          title="Descargar"
          aria-label={`Descargar ${project.nombre}`}
        >
          <Download size={18} />
        </button>
        <button
          className="m3-button m3-button--text m3-button--icon project-card__action-btn project-card__action-btn--delete"
          onClick={() => onDelete(project.id)}
          title="Eliminar"
          aria-label={`Eliminar ${project.nombre}`}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </article>
  );
}