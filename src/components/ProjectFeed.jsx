import { Inbox } from 'lucide-react';
import ProjectCard from './ProjectCard.jsx';
import './ProjectFeed.css';

export default function ProjectFeed({ projects, loading, onPreview, onDownload, onDelete }) {
  if (loading) {
    return (
      <section className="feed-section">
        <div className="container">
          <div className="feed-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="m3-card project-card-skeleton">
                <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8 }} />
                <div className="skeleton" style={{ width: '70%', height: 20, marginTop: 8 }} />
                <div className="skeleton" style={{ width: '50%', height: 14, marginTop: 8 }} />
                <div className="skeleton" style={{ width: '60%', height: 14, marginTop: 4 }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 20 }} />
                  <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 20 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (projects.length === 0) {
    return (
      <section className="feed-section">
        <div className="container">
          <div className="feed-empty">
            <div className="feed-empty__icon">
              <Inbox size={48} />
            </div>
            <h2 className="feed-empty__title">No hay proyectos aún</h2>
            <p className="feed-empty__text">
              Arrastra o selecciona un archivo HTML o ZIP en la zona de carga para comenzar.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="feed-section">
      <div className="container">
        <div className="feed-grid">
          {projects.map((project, index) => (
            <div key={project.id} style={{ animationDelay: `${index * 0.05}s` }}>
              <ProjectCard
                project={project}
                onPreview={onPreview}
                onDownload={onDownload}
                onDelete={onDelete}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}