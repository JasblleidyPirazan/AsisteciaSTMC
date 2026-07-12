import express from 'express';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = 'test-secret-please-ignore';

// Sign a JWT for a user, mirroring what /auth/login issues.
export function tokenFor({ id = 'u1', role = 'TEACHER' } = {}) {
  return jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '7d' });
}

// Build a minimal Express app that mounts the given router behind auth,
// exactly like src/index.js does (authMiddleware → router → errorHandler).
export async function buildApp(mountPath, router, { withAuth = true } = {}) {
  const { authMiddleware } = await import('../../src/middleware/auth.js');
  const errorHandler = (await import('../../src/middleware/errorHandler.js')).default;

  const app = express();
  app.use(express.json());
  if (withAuth) {
    app.use(mountPath, authMiddleware, router);
  } else {
    app.use(mountPath, router);
  }
  app.use(errorHandler);
  return app;
}
