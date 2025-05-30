const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'https://conforma-remitos.vercel.app'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Configuración de SQL Server optimizada para Render
const config = {
  server: '192.168.100.164',
  database: 'EstProd',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 15000, // Reducido para Render
    connectionTimeout: 15000,
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
    max: 5, // Reducido para plan gratuito
    min: 0,
    idleTimeoutMillis: 20000,
  },
};

let pool = null;
let isConnecting = false;

// Función para conectar con reintentos
async function connectDB() {
  if (pool && pool.connected) {
    return pool;
  }

  if (isConnecting) {
    // Esperar si ya se está conectando
    await new Promise(resolve => setTimeout(resolve, 1000));
    return pool;
  }

  try {
    isConnecting = true;
    console.log('🔄 Conectando a SQL Server...');
    
    if (pool) {
      try {
        await pool.close();
      } catch (e) {
        console.log('Pool anterior cerrado');
      }
    }
    
    pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server');
    isConnecting = false;
    return pool;
  } catch (error) {
    isConnecting = false;
    console.error('❌ Error conectando:', error.message);
    throw error;
  }
}

// Endpoint de health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API de Conformación de Remitos funcionando en Render',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Endpoint para probar conexión
app.get('/api/test', async (req, res) => {
  const timeout = setTimeout(() => {
    res.status(408).json({
      success: false,
      error: 'Timeout de conexión'
    });
  }, 12000); // Timeout de 12 segundos

  try {
    const connection = await connectDB();
    const request = new sql.Request(connection);
    const result = await request.query('SELECT @@VERSION as version, GETDATE() as fecha');
    
    clearTimeout(timeout);
    res.json({
      success: true,
      message: 'Conexión exitosa desde Render',
      data: result.recordset[0],
      server: config.server,
      database: config.database
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error('Error en test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.code || 'UNKNOWN'
    });
  }
});

// Endpoint para actualizar remito
app.post('/api/update', async (req, res) => {
  const timeout = setTimeout(() => {
    res.status(408).json({
      error: 'Timeout en actualización'
    });
  }, 12000);

  try {
    const { numeroRemito, nuevoEstado = 'CONFORMADO' } = req.body;

    if (!numeroRemito) {
      clearTimeout(timeout);
      return res.status(400).json({ error: 'numeroRemito es requerido' });
    }

    console.log(`🔄 Actualizando remito: ${numeroRemito}`);

    const connection = await connectDB();
    const request = new sql.Request(connection);

    request.input('numeroRemito', sql.VarChar(50), numeroRemito);
    request.input('nuevoEstado', sql.VarChar(50), nuevoEstado);
    request.input('fechaActualizacion', sql.DateTime, new Date());

    // Consulta de update
    const updateQuery = `
      UPDATE UsuariosPortalTb 
      SET nombreUsuario = @nuevoEstado,
          contraseña = @fechaActualizacion
      WHERE id = @numeroRemito
    `;

    const result = await request.query(updateQuery);
    clearTimeout(timeout);

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
    clearTimeout(timeout);
    console.error('❌ Error en update:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message,
      code: error.code
    });
  }
});

// Endpoint para mantener vivo el servicio
app.get('/ping', (req, res) => {
  res.json({ pong: true, timestamp: Date.now() });
});

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT} (Render)`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Intentar conectar al inicio
  connectDB().catch(error => {
    console.error('❌ Error inicial de conexión:', error.message);
  });
});

// Manejar cierre graceful
const gracefulShutdown = async (signal) => {
  console.log(`🛑 Recibido ${signal}. Cerrando servidor...`);
  
  server.close(async () => {
    console.log('🔒 Servidor HTTP cerrado');
    
    if (pool) {
      try {
        await pool.close();
        console.log('🔒 Pool SQL cerrado');
      } catch (error) {
        console.error('Error cerrando pool:', error);
      }
    }
    
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Keep-alive para Render (evita que se duerma)
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    console.log('🔄 Keep-alive ping');
  }, 14 * 60 * 1000); // Cada 14 minutos
} 