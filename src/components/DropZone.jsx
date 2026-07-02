import { useState, useRef, useCallback } from 'react';
import { Upload, File, X, AlertCircle, FileArchive } from 'lucide-react';
import './DropZone.css';

const ACCEPTED_TYPES = ['.html', '.zip'];

export default function DropZone({ onUpload, uploading }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [responsible, setResponsible] = useState('');
  const [tags, setTags] = useState('');
  const [fechaCreacion, setFechaCreacion] = useState('');
  const fileInputRef = useRef(null);

  const validateFile = useCallback((f) => {
    if (!f) return null;
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      setError('Solo se permiten archivos .html o .zip');
      return null;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError('El archivo no puede superar los 50MB');
      return null;
    }
    setError('');
    return f;
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    const valid = validateFile(f);
    if (valid) setFile(valid);
  }, [validateFile]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    const valid = validateFile(f);
    if (valid) setFile(valid);
  };

  const handleSubmit = async () => {
    if (!file) return;
    try {
      await onUpload(file, responsible, tags, fechaCreacion);
      setFile(null);
      setResponsible('');
      setTags('');
      setFechaCreacion('');
    } catch (err) {
      setError(err.message);
    }
  };

  const clearFile = () => {
    setFile(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const ext = file ? '.' + file.name.split('.').pop().toLowerCase() : '';

  return (
    <section className="dropzone-section">
      <div className="container">
        <div
          className={`dropzone ${dragOver ? 'dropzone--drag' : ''} ${file ? 'dropzone--has-file' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !file && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.zip"
            onChange={handleFileSelect}
            className="dropzone__input"
            hidden
          />

          {!file ? (
            <div className="dropzone__placeholder">
              <div className="dropzone__icon-wrapper">
                <Upload size={40} />
              </div>
              <p className="dropzone__text">
                <strong>Haz clic para seleccionar</strong> o arrastra un archivo aquí
              </p>
              <p className="dropzone__hint">
                Archivos .html o .zip (máx. 50MB)
              </p>
            </div>
          ) : (
            <div className="dropzone__file-info" onClick={(e) => e.stopPropagation()}>
              <div className="dropzone__file-header">
                <div className="dropzone__file-icon">
                  {ext === '.zip' ? <FileArchive size={24} /> : <File size={24} />}
                </div>
                <div className="dropzone__file-details">
                  <span className="dropzone__file-name">{file.name}</span>
                  <span className="dropzone__file-size">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                <button className="dropzone__clear-btn" onClick={clearFile} title="Eliminar archivo">
                  <X size={20} />
                </button>
              </div>

              <div className="dropzone__meta">
                <div className="dropzone__field-group">
                  <label className="dropzone__field-label">Responsable</label>
                  <select
                    className="m3-input m3-select"
                    value={responsible}
                    onChange={(e) => setResponsible(e.target.value)}
                  >
                    <option value="">Seleccionar responsable</option>
                    <option value="Alejandro Vasquez">Alejandro Vasquez</option>
                    <option value="Ronny Salazar">Ronny Salazar</option>
                  </select>
                </div>
                <input
                  type="text"
                  className="m3-input"
                  placeholder="Etiquetas separadas por coma (opcional)"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
                <div className="dropzone__date-field">
                  <label className="dropzone__date-label">Fecha de creación</label>
                  <input
                    type="date"
                    className="m3-input"
                    value={fechaCreacion}
                    onChange={(e) => setFechaCreacion(e.target.value)}
                  />
                </div>
              </div>

              <button
                className="m3-button m3-button--filled dropzone__submit"
                onClick={handleSubmit}
                disabled={uploading}
              >
                {uploading ? 'Subiendo...' : 'Subir proyecto'}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="dropzone__error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </section>
  );
}