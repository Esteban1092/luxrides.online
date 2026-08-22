import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { rateLimit } from 'express-rate-limit';

import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import emailRoutes from './routes/email.routes.js';
import groqRoutes from './routes/groq.routes.js';
import pushRoutes from './routes/push.routes.js';
import adminRoutes from './routes/admin.routes.js';
import adminChoferesRoutes from './routes/admin-choferes.routes.js';
import adminOpsRoutes from './routes/admin-ops.routes.js';
import driverRoutes from './routes/driver.routes.js';
import lovoxRoutes from './routes/lovox.routes.js';
import reservationRoutes from './routes/reservation.routes.js';
import quoteRoutes from './routes/quote.routes.js';
import stripeRoutes from './routes/stripe.routes.js';
import authRoutes from './routes/auth.routes.js';
import { errorHandler, notFound } from './middleware/error.js';

const app = express();
const PORT = process.env.PORT || 8787;
const frontendDir = path.resolve(process.cwd(), '../luxrides');

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false // Manejado por Hostinger/Nginx
}));
app.use(morgan('dev'));

app.use(express.static(frontendDir));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'sas.html'), (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ ok: false, error: 'Frontend no disponible en este deploy' });
    }
  });
});

// Webhook de Stripe: raw body obligatorio antes de express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// Rate limit general: 600 req / 15 min por IP (el panel admin hace peticiones frecuentes)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
  message: { ok: false, error: 'Demasiadas peticiones. Intenta en unos minutos.' }
});

// Rate limit estricto para login: 20 intentos / 15 min
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Límite de intentos alcanzado. Espera antes de reintentar.' }
});

// Rate limit para chat IA: 80 req / 15 min
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes al asistente. Espera un momento.' }
});

function isOriginPermitido(origin) {
  if (!origin) return true;
  if (origin === env.frontendOrigin) return true;
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === 'luxrides.online' || host.endsWith('.luxrides.online')) return true;
    if (host.endsWith('.vercel.app') || host.endsWith('.vercel.dev')) return true;
    if (host.endsWith('.app.github.dev')) return true;
  } catch (e) {
    return false;
  }
  return false;
}

app.use(cors({
  origin(origin, callback) {
    if (isOriginPermitido(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed: ' + origin));
  },
  credentials: true
}));
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false }));

// Aplicar rate limits
app.use('/api/', globalLimiter);
app.use('/api/admin/login', strictLimiter);
app.use('/api/stripe/pagar', strictLimiter);
app.use('/api/chat', chatLimiter);
app.use('/api/lovox/speak', chatLimiter);

app.use('/api', healthRoutes);
app.use('/api', emailRoutes);
app.use('/api', groqRoutes);
app.use('/api', pushRoutes);
app.use('/api', adminRoutes);
app.use('/api', adminChoferesRoutes);
app.use('/api', adminOpsRoutes);
app.use('/api', driverRoutes);
app.use('/api', reservationRoutes);
app.use('/api', lovoxRoutes);
app.use('/api', quoteRoutes);
app.use('/api', stripeRoutes);
app.use('/api', authRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[luxrides-backend] escuchando en puerto ${PORT}`);
  console.log('[luxrides-backend] origin permitido: ' + env.frontendOrigin);
});
