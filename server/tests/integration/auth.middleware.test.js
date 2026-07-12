// mockPrisma MUST be imported before the middleware so the require.cache
// injection lands before the CJS graph captures the prisma reference.
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { JWT_SECRET, tokenFor } from '../helpers/testApp.js';

let app;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;

  const { authMiddleware, requireRole } = await import('../../src/middleware/auth.js');
  const errorHandler = (await import('../../src/middleware/errorHandler.js')).default;

  const router = express.Router();
  router.get('/whoami', (req, res) => res.json({ success: true, user: req.user }));
  router.get('/admin-only', requireRole('ADMIN'), (req, res) =>
    res.json({ success: true, user: req.user })
  );

  app = express();
  app.use(express.json());
  app.use('/api', authMiddleware, router);
  app.use(errorHandler);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.user = { findUnique: vi.fn() };
});

describe('authMiddleware', () => {
  it('rechaza sin header Authorization (401)', async () => {
    const res = await request(app).get('/api/whoami');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Token requerido/);
  });

  it('rechaza header sin esquema Bearer (401)', async () => {
    const res = await request(app).get('/api/whoami').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
  });

  it('rechaza un token inválido (401)', async () => {
    const res = await request(app).get('/api/whoami').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/inválido|expirado/i);
  });

  it('rechaza si el usuario ya no existe (401)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/whoami')
      .set('Authorization', `Bearer ${tokenFor({ id: 'ghost' })}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/inactivo o no encontrado/i);
  });

  it('rechaza a un usuario desactivado aunque el token sea válido (401)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'x@y.z',
      role: 'TEACHER',
      active: false,
    });
    const res = await request(app)
      .get('/api/whoami')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(401);
  });

  it('deja pasar a un usuario activo y expone req.user desde la BD', async () => {
    // El rol efectivo se toma de la BD, no del token (revalidación en vivo)
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'teach@stmc.co',
      role: 'TEACHER',
      active: true,
    });
    const res = await request(app)
      .get('/api/whoami')
      .set('Authorization', `Bearer ${tokenFor({ role: 'ADMIN' })}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 'u1', email: 'teach@stmc.co', role: 'TEACHER' });
  });
});

describe('requireRole', () => {
  it('deniega a un rol no autorizado (403)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 't@stmc.co',
      role: 'TEACHER',
      active: true,
    });
    const res = await request(app)
      .get('/api/admin-only')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(403);
  });

  it('permite al rol autorizado (200)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'a1',
      email: 'admin@stmc.co',
      role: 'ADMIN',
      active: true,
    });
    const res = await request(app)
      .get('/api/admin-only')
      .set('Authorization', `Bearer ${tokenFor({ id: 'a1', role: 'ADMIN' })}`);
    expect(res.status).toBe(200);
  });
});
