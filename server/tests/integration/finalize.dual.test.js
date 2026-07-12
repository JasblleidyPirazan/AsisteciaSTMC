// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Guards on the dual-report finalize: ADMIN is read-only (403); SUPERADMIN must
// state which report it edits (400 without reporterType). Both return before
// the consolidation engine runs, so no DB beyond auth + the session lookup.
let app;

const SESSION = { id: 's1', groupId: 'g1', group: { id: 'g1', professorId: 'p1' }, firstReportedAt: null };

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const sessionsRouter = (await import('../../src/routes/sessions.js')).default;
  app = await buildApp('/api/sessions', sessionsRouter);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.user = { findUnique: vi.fn() };
  prismaMock.classSession = { findUnique: vi.fn().mockResolvedValue(SESSION) };
});

function finalize(token, body = {}) {
  return request(app)
    .post('/api/sessions/s1/finalize')
    .set('Authorization', `Bearer ${token}`)
    .send({ attendanceRecords: [], ...body });
}

describe('POST /api/sessions/:id/finalize — guards del doble reporte', () => {
  it('ADMIN es solo-lectura: no puede finalizar → 403', async () => {
    const res = await finalize(authAs('ADMIN'));
    expect(res.status).toBe(403);
  });

  it('SUPERADMIN sin reporterType → 400 (debe indicar qué reporte edita)', async () => {
    const res = await finalize(authAs('SUPERADMIN'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tipo de reporte/i);
  });

  it('valida attendanceRecords no-lista → 400', async () => {
    const res = await request(app)
      .post('/api/sessions/s1/finalize')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`)
      .send({ attendanceRecords: 'nope' });
    expect(res.status).toBe(400);
  });
});
