import { useState, useMemo, useCallback } from 'react';
import Header from './components/Header.jsx';
import DropZone from './components/DropZone.jsx';
import SearchBar from './components/SearchBar.jsx';
import FilterChips from './components/FilterChips.jsx';
import ProjectFeed from './components/ProjectFeed.jsx';
import PreviewModal from './components/PreviewModal.jsx';
import Toast from './components/Toast.jsx';
import CursorLight from './components/CursorLight.jsx';
import { useProjects } from './hooks/useProjects.js';

function filterAndSortProjects(projects, searchQuery, activeFilter, responsibleFilter) {
  let result = [...projects];

  // Filter by responsable
  if (responsibleFilter) {
    result = result.filter((p) => p.responsable === responsibleFilter);
  }

  // Search filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.responsable.toLowerCase().includes(q) ||
        p.etiquetas?.some((t) => t.toLowerCase().includes(q))
    );
  }

  // Sort
  switch (activeFilter) {
    case 'recent':
      result.sort((a, b) => new Date(b.fecha_subida) - new Date(a.fecha_subida));
      break;
    case 'oldest':
      result.sort((a, b) => new Date(a.fecha_subida) - new Date(b.fecha_subida));
      break;
    case 'alpha':
      result.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      break;
    case 'responsible':
      result.sort((a, b) => a.responsable.localeCompare(b.responsable, 'es'));
      break;
    default:
      // Default: most recent first
      result.sort((a, b) => new Date(b.fecha_subida) - new Date(a.fecha_subida));
  }

  return result;
}

export default function App() {
  const { projects, loading, error, upload, remove } = useProjects();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState(null);
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [previewProject, setPreviewProject] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const filteredProjects = useMemo(
    () => filterAndSortProjects(projects, searchQuery, activeFilter, responsibleFilter),
    [projects, searchQuery, activeFilter, responsibleFilter]
  );

  const handleUpload = useCallback(
    async (file, responsible, tags, fechaCreacion) => {
      setUploading(true);
      try {
        await upload(file, responsible, tags, fechaCreacion);
        setToastMessage('Proyecto subido correctamente');
        setToastVisible(true);
      } finally {
        setUploading(false);
      }
    },
    [upload]
  );

  const handleDownload = useCallback((project) => {
    const a = document.createElement('a');
    a.href = project.ruta;
    a.download = project.nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleDelete = useCallback(
    async (id) => {
      if (window.confirm('¿Estás seguro de eliminar este proyecto?')) {
        try {
          await remove(id);
        } catch (err) {
          alert('Error al eliminar: ' + err.message);
        }
      }
    },
    [remove]
  );

  return (
    <>
      <Header projectCount={filteredProjects.length} />

      <main>
        <DropZone onUpload={handleUpload} uploading={uploading} />

        {error && (
          <div className="container">
            <div className="dropzone__error" style={{ marginBottom: 16 }}>
              <span>Error al cargar proyectos: {error}</span>
            </div>
          </div>
        )}

        <div className="container">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <FilterChips
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            responsibleFilter={responsibleFilter}
            onResponsibleFilterChange={setResponsibleFilter}
          />
        </div>

        <ProjectFeed
          projects={filteredProjects}
          loading={loading}
          onPreview={setPreviewProject}
          onDownload={handleDownload}
          onDelete={handleDelete}
        />
      </main>

      {previewProject && (
        <PreviewModal
          project={previewProject}
          onClose={() => setPreviewProject(null)}
        />
      )}

      <CursorLight />

      <Toast
        message={toastMessage}
        visible={toastVisible}
        onClose={() => setToastVisible(false)}
      />
    </>
  );
}