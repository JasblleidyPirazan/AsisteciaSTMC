import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';

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

  // En producción, sirve el frontend compilado (servicio único en Railway).
  // CLIENT_DIST por defecto apunta a ../client/dist relativo a /server.
  const clientDist = process.env.CLIENT_DIST
    ? path.resolve(process.env.CLIENT_DIST)
    : path.resolve(process.cwd(), '..', 'client', 'dist');

  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);

  return app;
}
