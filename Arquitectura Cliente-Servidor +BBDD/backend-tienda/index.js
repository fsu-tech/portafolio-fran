const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'tienda_moda', // nombre de tu BBDD
  password: '75148862L',
  port: 5432,
});

client.connect()
  .then(() => console.log('Conectado a PostgreSQL'))
  .catch(err => console.error('Error de conexión', err));
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Habilitar CORS para Angular (por defecto localhost:4200)
app.use(cors({ origin: 'http://localhost:4200' }));

// Middleware para parsear JSON
app.use(express.json());

// Endpoint para productos
app.get('/api/products', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM products');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al consultar productos');
  }
});
// Endpoint de prueba
app.get('/api/hello', (req, res) => {
  res.json({ message: '¡Hola desde el backend!' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
