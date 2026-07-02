import InHouseIsotipo from './InHouseIsotipo.jsx';
import StorageBar from './StorageBar.jsx';
import './Header.css';

export default function Header({ projectCount, usedBytes }) {
  return (
    <header className="header">
      <div className="container header__inner">
        <div className="header__brand">
          <InHouseIsotipo size={44} />
          <div>
            <h1 className="header__title">Repositorio de Proyectos</h1>
            <p className="header__subtitle">
              {projectCount} {projectCount === 1 ? 'proyecto' : 'proyectos'} almacenados
            </p>
          </div>
        </div>
        <StorageBar usedBytes={usedBytes} />
      </div>
    </header>
  );
}