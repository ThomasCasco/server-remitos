# API para Conformación de Remitos

Servidor Express que conecta con SQL Server para actualizar remitos.

## Endpoints

- `GET /` - Health check
- `GET /api/test` - Probar conexión con SQL Server  
- `POST /api/update` - Actualizar remito
- `GET /ping` - Keep alive

## Deployment en Render

Este proyecto está configurado para deployarse automáticamente en Render.com

## Variables de entorno necesarias

- `NODE_ENV=production`
- `PORT` (automático en Render)

## Stack

- Node.js + Express
- SQL Server (mssql driver)
- CORS habilitado 