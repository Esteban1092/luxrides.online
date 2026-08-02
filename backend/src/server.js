import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

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
import { errorHandler, notFound } from './middleware/error.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(morgan('dev'));

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
app.use(express.json({ limit: '1mb' }));

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

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log('[luxrides-backend] escuchando en puerto ' + env.port);
  console.log('[luxrides-backend] origin permitido: ' + env.frontendOrigin);
});
