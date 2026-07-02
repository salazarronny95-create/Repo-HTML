import app from '../api/index.js';

const PORT = process.env.API_PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
