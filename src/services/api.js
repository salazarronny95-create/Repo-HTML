const API_BASE = '/api';

export async function fetchProjects() {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error('Error al cargar proyectos');
  return res.json();
}

export async function getProject(id) {
  const res = await fetch(`${API_BASE}/projects/${id}`);
  if (!res.ok) throw new Error('Proyecto no encontrado');
  return res.json();
}

export async function uploadProject(file, responsible = '', tags = '', fechaCreacion = '') {
  const formData = new FormData();
  formData.append('file', file);
  if (responsible) formData.append('responsible', responsible);
  if (tags) formData.append('tags', tags);
  if (fechaCreacion) formData.append('fecha_creacion', fechaCreacion);

  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error al subir archivo');
  }

  return res.json();
}

export async function deleteProject(id) {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Error al eliminar proyecto');
  return res.json();
}