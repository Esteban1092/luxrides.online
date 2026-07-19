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
import { errorHandler, notFound } from './middleware/error.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === env.frontendOrigin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed: ' + origin));
  },
  credentials: false
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api', healthRoutes);
app.use('/api', emailRoutes);
app.use('/api', groqRoutes);
app.use('/api', pushRoutes);
app.use('/api', adminRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log('[luxrides-backend] escuchando en puerto ' + env.port);
  console.log('[luxrides-backend] origin permitido: ' + env.frontendOrigin);
});
