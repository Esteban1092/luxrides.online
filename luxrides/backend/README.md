# LuxRides Backend

Backend Node.js para mover secretos fuera del frontend y atender rutas API de LuxRides.

## Estructura

- src/server.js: arranque de Express, CORS, helmet y registro de rutas.
- src/config/env.js: carga y validacion de variables de entorno.
- src/routes/health.routes.js: endpoint de salud.
- src/routes/email.routes.js: envio de correos de reserva.
- src/routes/chat.routes.js: puente seguro para Groq chat.
- src/services/email.service.js: integracion SMTP con nodemailer.
- src/services/groq.service.js: llamada server-to-server a Groq.
- src/middleware/error.js: manejo de errores y 404.

## Endpoints

- GET /api/health
- POST /api/enviar-reserva
- POST /api/email/reserva-confirmacion
- POST /api/chat

## Puesta en marcha

1. Copia .env.example a .env.
2. Llena valores reales de .env.
3. Ejecuta npm install.
4. Ejecuta npm run dev en desarrollo o npm start en produccion.

## Variables clave

- FRONTEND_ORIGIN=https://luxrides.online
- GROQ_API_KEY=...
- SMTP_HOST=smtp.hostinger.com
- SMTP_PORT=465
- SMTP_USER=...
- SMTP_PASS=...
- SMTP_FROM=LuxRides Clientes <luxrides@luxrides.online>

## Despliegue recomendado en Hostinger

1. Subir carpeta backend al servidor.
2. Configurar Node 18+.
3. Crear archivo .env en servidor con las claves.
4. Ejecutar npm install y npm start.
5. Publicar proxy o subdominio para que https://luxrides.online/api apunte al backend.
