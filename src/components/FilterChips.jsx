import { ArrowUpDown, Calendar, User, X } from 'lucide-react';
import './FilterChips.css';

const RESPONSABLES = ['Alejandro Vasquez', 'Ronny Salazar'];

const FILTERS = [
  { id: 'recent', label: 'Más recientes', icon: Calendar },
  { id: 'oldest', label: 'Más antiguos', icon: Calendar },
  { id: 'alpha', label: 'A-Z', icon: ArrowUpDown },
];

export default function FilterChips({ activeFilter, onFilterChange, responsibleFilter, onResponsibleFilterChange }) {
  const showDropdown = activeFilter === 'responsible';

  const handleResponsibleToggle = () => {
    if (showDropdown) {
      onFilterChange(null);
      onResponsibleFilterChange('');
    } else {
      onFilterChange('responsible');
    }
  };

  const handleResponsibleSelect = (value) => {
    onResponsibleFilterChange(value);
  };

  const clearResponsible = () => {
    onResponsibleFilterChange('');
    onFilterChange(null);
  };

  return (
    <div className="filter-chips">
      <span className="filter-chips__label">Ordenar:</span>
      <div className="filter-chips__list">
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`m3-chip ${activeFilter === id ? 'm3-chip--active' : ''}`}
            onClick={() => onFilterChange(activeFilter === id ? null : id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
        <button
          className={`m3-chip ${showDropdown || responsibleFilter ? 'm3-chip--active' : ''}`}
          onClick={handleResponsibleToggle}
        >
          <User size={16} />
          {responsibleFilter || 'Responsable'}
          {responsibleFilter && (
            <span className="filter-chips__clear" onClick={(e) => { e.stopPropagation(); clearResponsible(); }}>
              <X size={14} />
            </span>
          )}
        </button>
      </div>

      {showDropdown && (
        <div className="filter-chips__dropdown-wrapper">
          <select
            className="m3-input m3-select filter-chips__dropdown"
            value={responsibleFilter}
            onChange={(e) => handleResponsibleSelect(e.target.value)}
          >
            <option value="">Todos los responsables</option>
            {RESPONSABLES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}