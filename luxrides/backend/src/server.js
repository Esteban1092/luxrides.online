import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import emailRoutes from './routes/email.routes.js';
import chatRoutes from './routes/chat.routes.js';
import adminRoutes from './routes/admin.routes.js';
import stripeRoutes from './routes/stripe.routes.js';
import { errorHandler, notFound } from './middleware/error.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: [env.frontendOrigin],
  credentials: false
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api', healthRoutes);
app.use('/api', emailRoutes);
app.use('/api', chatRoutes);
app.use('/api', adminRoutes);
app.use('/api', stripeRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log('[luxrides-backend] listening on port ' + env.port);
  console.log('[luxrides-backend] allowed origin: ' + env.frontendOrigin);
});
