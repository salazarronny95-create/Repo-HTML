import './StorageBar.css';

const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GB

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export default function StorageBar({ usedBytes }) {
  const pct = Math.min(100, (usedBytes / STORAGE_LIMIT_BYTES) * 100);

  return (
    <div
      className="storage-bar"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Espacio usado: ${formatBytes(usedBytes)} de ${formatBytes(STORAGE_LIMIT_BYTES)}`}
    >
      <div className="storage-bar__label">
        <span>{formatBytes(usedBytes)}</span>
        <span className="storage-bar__label-sep">/</span>
        <span>{formatBytes(STORAGE_LIMIT_BYTES)}</span>
      </div>
      <div className="storage-bar__track">
        <div className="storage-bar__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
