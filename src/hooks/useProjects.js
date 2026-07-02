import { useState, useEffect, useCallback } from 'react';
import { fetchProjects, uploadProject, deleteProject } from '../services/api.js';

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProjects();
      setProjects(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upload = useCallback(async (file, responsible, tags, fechaCreacion) => {
    const result = await uploadProject(file, responsible, tags, fechaCreacion);
    // Append locally instead of reloading — Blob storage takes a moment to
    // propagate the metadata write, so an immediate reload can race it.
    setProjects((prev) => [...prev, ...result]);
    return result;
  }, []);

  const remove = useCallback(async (id) => {
    await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { projects, loading, error, upload, remove, reload: load };
}