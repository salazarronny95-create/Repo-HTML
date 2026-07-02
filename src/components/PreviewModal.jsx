import { useEffect, useRef, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import './PreviewModal.css';

export default function PreviewModal({ project, onClose }) {
  const iframeRef = useRef(null);
  const [htmlContent, setHtmlContent] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);

  useEffect(() => {
    if (!project) return;
    setLoadingPreview(true);
    fetch(project.ruta)
      .then((res) => res.text())
      .then((html) => {
        setHtmlContent(html);
        setLoadingPreview(false);
      })
      .catch(() => {
        setHtmlContent(
          '<div style="padding:40px;text-align:center;color:#94A3B8;font-family:sans-serif">Error al cargar la vista previa</div>'
        );
        setLoadingPreview(false);
      });
  }, [project]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!project) return null;

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal__header">
          <div className="preview-modal__title">
            <h2>{project.nombre}</h2>
            <span className="preview-modal__badge">Vista previa</span>
          </div>
          <button className="preview-modal__close m3-button m3-button--icon" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        <div className="preview-modal__body">
          {loadingPreview ? (
            <div className="preview-modal__loading">
              <div className="skeleton" style={{ width: '80%', height: 24, margin: '24px auto' }} />
              <div className="skeleton" style={{ width: '60%', height: 400, margin: '0 auto' }} />
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              srcDoc={htmlContent}
              className="preview-modal__iframe"
              sandbox="allow-scripts"
              title={`Vista previa de ${project.nombre}`}
            />
          )}
        </div>
        <div className="preview-modal__footer">
          <p className="preview-modal__info">
            Este visor está encapsulado para proteger la aplicación principal.
          </p>
          <a
            href={project.ruta}
            target="_blank"
            rel="noopener noreferrer"
            className="m3-button m3-button--outlined"
          >
            <ExternalLink size={16} />
            Abrir en nueva pestaña
          </a>
        </div>
      </div>
    </div>
  );
}