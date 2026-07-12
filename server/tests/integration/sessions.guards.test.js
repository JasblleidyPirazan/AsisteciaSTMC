// mockPrisma MUST be imported before any router/middleware so the require.cache
// injection lands before the CJS graph captures the prisma reference.
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Exercises the canReportGroup() authorization guard in routes/sessions.js
// through POST /api/sessions, for every role.
let app;

const GROUP = { id: 'g1', professorId: 'p1', name: 'Roja A' };

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({
      id,
      email: `${role.toLowerCase()}@stmc.co`,
      role,
      active: true,
    }),
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
  // Model accessors touched by the create flow.
  prismaMock.user = { findUnique: vi.fn() };
  prismaMock.professor = { findUnique: vi.fn() };
  prismaMock.group = { findUnique: vi.fn().mockResolvedValue(GROUP) };
  prismaMock.studentEnrollment = { findFirst: vi.fn() };
  prismaMock.classSession = {
    upsert: vi.fn().mockResolvedValue({ id: 's1', groupId: GROUP.id, status: 'PROGRAMADA' }),
  };
});

function createSession(token) {
  return request(app)
    .post('/api/sessions')
    .set('Authorization', `Bearer ${token}`)
    .send({ groupId: GROUP.id, date: '2025-06-10' });
}

describe('POST /api/sessions — guard canReportGroup', () => {
  it('valida el body (groupId y date requeridos) → 400', async () => {
    const token = authAs('ADMIN');
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('ADMIN puede reportar cualquier grupo → 201', async () => {
    const res = await createSession(authAs('ADMIN'));
    expect(res.status).toBe(201);
    expect(prismaMock.classSession.upsert).toHaveBeenCalled();
  });

  it('PHYSICAL_TRAINER (Coordinador) puede reportar cualquier grupo → 201', async () => {
    const res = await createSession(authAs('PHYSICAL_TRAINER'));
    expect(res.status).toBe(201);
  });

  it('TEACHER titular del grupo → 201', async () => {
    const token = authAs('TEACHER');
    prismaMock.professor.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    const res = await createSession(token);
    expect(res.status).toBe(201);
  });

  it('TEACHER de OTRO grupo (no es el titular) → 403', async () => {
    const token = authAs('TEACHER');
    prismaMock.professor.findUnique.mockResolvedValue({ id: 'pX', userId: 'u1' }); // ≠ professorId
    const res = await createSession(token);
    expect(res.status).toBe(403);
    expect(prismaMock.classSession.upsert).not.toHaveBeenCalled();
  });

  it('TEACHER sin ficha de profesor vinculada → 403', async () => {
    const token = authAs('TEACHER');
    prismaMock.professor.findUnique.mockResolvedValue(null);
    const res = await createSession(token);
    expect(res.status).toBe(403);
  });

  it('PARENT con un hijo inscrito en el grupo → 201', async () => {
    const token = authAs('PARENT');
    prismaMock.studentEnrollment.findFirst.mockResolvedValue({ id: 'e1', groupId: GROUP.id });
    const res = await createSession(token);
    expect(res.status).toBe(201);
  });

  it('PARENT sin hijo en el grupo → 403', async () => {
    const token = authAs('PARENT');
    prismaMock.studentEnrollment.findFirst.mockResolvedValue(null);
    const res = await createSession(token);
    expect(res.status).toBe(403);
  });

  it('ASSISTANT nunca puede reportar por esta vía → 403', async () => {
    const res = await createSession(authAs('ASSISTANT'));
    expect(res.status).toBe(403);
    expect(prismaMock.classSession.upsert).not.toHaveBeenCalled();
  });
});
