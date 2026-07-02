import { Search, X } from 'lucide-react';
import './SearchBar.css';

export default function SearchBar({ value, onChange }) {
  return (
    <div className="search-bar-container">
      <div className="container">
        <div className="search-bar">
          <Search size={20} className="search-bar__icon" />
          <input
            type="text"
            className="search-bar__input"
            placeholder="Buscar proyectos por nombre o responsable..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {value && (
            <button
              className="search-bar__clear"
              onClick={() => onChange('')}
              title="Limpiar búsqueda"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}