// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Professors no longer report festivals — only the coordinator/admin does.
let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const festivalsRouter = (await import('../../src/routes/festivals.js')).default;
  app = await buildApp('/api/festivals', festivalsRouter);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.classSession = { findMany: vi.fn().mockResolvedValue([]) };
});

describe('GET /api/festivals — el profesor ya no accede a festivales', () => {
  it('TEACHER → 403', async () => {
    const res = await request(app)
      .get('/api/festivals')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(403);
  });

  it('PHYSICAL_TRAINER (Coordinador) → 200', async () => {
    const res = await request(app)
      .get('/api/festivals')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(200);
  });

  it('SUPERADMIN → 200 (superset)', async () => {
    const res = await request(app)
      .get('/api/festivals')
      .set('Authorization', `Bearer ${authAs('SUPERADMIN')}`);
    expect(res.status).toBe(200);
  });
});
