import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.routes.js';
import enrollmentRoutes from './routes/enrollment.routes.js';
import groupRoutes from './routes/group.routes.js';
import studentRoutes from './routes/student.routes.js';
import sessionRoutes from './routes/session.routes.js';
import settlementRoutes from './routes/settlement.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'asistencia-tenis', version: '2.0.0' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/enrollment', enrollmentRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/settlements', settlementRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
