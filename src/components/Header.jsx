import { FolderOpen } from 'lucide-react';
import './Header.css';

export default function Header({ projectCount }) {
  return (
    <header className="header">
      <div className="container header__inner">
        <div className="header__brand">
          <div className="header__icon">
            <FolderOpen size={28} />
          </div>
          <div>
            <h1 className="header__title">Repositorio de Proyectos</h1>
            <p className="header__subtitle">
              {projectCount} {projectCount === 1 ? 'proyecto' : 'proyectos'} almacenados
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}