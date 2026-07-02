export function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('es-EC', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateFull(isoString) {
  return new Date(isoString).toLocaleDateString('es-EC', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}