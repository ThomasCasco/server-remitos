const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de SQL Server
const config = {
  server: '192.168.100.164',
  database: 'EstProd',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 30000,
    connectionTimeout: 30000,
  },
  authentication: {
    type: 'ntlm',
    options: {
      domain: 'IMSA',
      userName: 'A_TCasco',
      password: 'Tiranytar.2023!'
    },
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

// Función para conectar
async function connectDB() {
  try {
    if (pool) return pool;
    pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server');
    return pool;
  } catch (error) {
    console.error('❌ Error conectando:', error);
    throw error;
  }
}

// Endpoint de health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API de Conformación de Remitos funcionando',
    timestamp: new Date().toISOString()
  });
});

// Endpoint para probar conexión
app.get('/api/test', async (req, res) => {
  try {
    const connection = await connectDB();
    const request = new sql.Request(connection);
    const result = await request.query('SELECT @@VERSION as version, GETDATE() as fecha');
    
    res.json({
      success: true,
      message: 'Conexión exitosa',
      data: result.recordset[0]
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para actualizar remito
app.post('/api/update', async (req, res) => {
  try {
    const { numeroRemito, nuevoEstado = 'CONFORMADO' } = req.body;

    if (!numeroRemito) {
      return res.status(400).json({ error: 'numeroRemito es requerido' });
    }

    console.log(`🔄 Actualizando remito: ${numeroRemito}`);

    const connection = await connectDB();
    const request = new sql.Request(connection);

    request.input('numeroRemito', sql.VarChar(50), numeroRemito);
    request.input('nuevoEstado', sql.VarChar(50), nuevoEstado);
    request.input('fechaActualizacion', sql.DateTime, new Date());

    // Usa tu consulta real aquí
    const updateQuery = `
      UPDATE UsuariosPortalTb 
      SET nombreUsuario = @nuevoEstado,
          contraseña = @fechaActualizacion
      WHERE id = @numeroRemito
    `;

    const result = await request.query(updateQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        error: 'No se encontró el registro',
        numeroRemito 
      });
    }

    console.log(`✅ Remito ${numeroRemito} actualizado`);

    res.json({ 
      message: `Remito ${numeroRemito} actualizado exitosamente`,
      rowsAffected: result.rowsAffected[0],
      numeroRemito,
      nuevoEstado,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  connectDB().catch(console.error);
});

// Manejar cierre graceful
process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  if (pool) {
    await pool.close();
  }
  process.exit(0);
}); 