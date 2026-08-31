// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Flujo de reposiciones grupales: las crea el coordinador, las ve el profesor
// titular, las ve el asistente para marcar acompañamiento, y se reportan con las
// mismas reglas que una clase regular (quincena cerrada bloqueada).
let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

// La quincena de la sesión está cerrada o no (lib/payrollLock → payrollClosure).
function lockPeriod(locked) {
  prismaMock.payrollClosure = {
    findUnique: vi.fn().mockResolvedValue(locked ? { period: '2026-08-2', locked: true } : null),
  };
}

const MAKEUP = {
  id: 'm1', kind: 'MAKEUP', status: 'PROGRAMADA', date: new Date('2026-08-20T00:00:00Z'),
  effectiveUnits: 1, makeupProfessorId: 'p1', substituteProfessorId: null,
  assistantId: 'a1', firstReportedAt: null,
};

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const makeupsRouter = (await import('../../src/routes/makeups.js')).default;
  app = await buildApp('/api/makeups', makeupsRouter);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.classSession = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(MAKEUP),
    create: vi.fn().mockResolvedValue({ id: 'm1' }),
    update: vi.fn().mockResolvedValue({ id: 'm1' }),
  };
  prismaMock.professor = { findUnique: vi.fn().mockResolvedValue({ id: 'p1', name: 'Ana' }) };
  prismaMock.makeupParticipant = { deleteMany: vi.fn(), createMany: vi.fn() };
  lockPeriod(false);
});

describe('GET /api/makeups — quién ve las reposiciones', () => {
  it('ASSISTANT → 200 (las necesita para marcar acompañamiento)', async () => {
    const res = await request(app)
      .get('/api/makeups')
      .set('Authorization', `Bearer ${authAs('ASSISTANT')}`);
    expect(res.status).toBe(200);
    // El asistente ve todas las del día: no se filtran por profesor.
    expect(prismaMock.classSession.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it('TEACHER → 200, solo las asignadas a él', async () => {
    const res = await request(app)
      .get('/api/makeups')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(200);
    expect(prismaMock.classSession.findMany.mock.calls[0][0].where.OR).toEqual([
      { makeupProfessorId: 'p1' },
      { substituteProfessorId: 'p1' },
    ]);
  });

  it('PARENT → 403', async () => {
    const res = await request(app)
      .get('/api/makeups')
      .set('Authorization', `Bearer ${authAs('PARENT')}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/makeups — el coordinador las crea', () => {
  const body = {
    date: '2026-08-20', professorId: 'p1', assistantId: 'a1',
    countsAsUnits: 1, studentIds: ['s1', 's2'],
  };

  it('TEACHER no puede crearlas → 403', async () => {
    const res = await request(app)
      .post('/api/makeups').send(body)
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(403);
  });

  it('Coordinador crea y su asignación de asistente queda validada', async () => {
    const res = await request(app)
      .post('/api/makeups').send(body)
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER', 'coord1')}`);
    expect(res.status).toBe(201);
    const data = prismaMock.classSession.create.mock.calls[0][0].data;
    expect(data.assistantId).toBe('a1');
    expect(data.coordinatorValidatedById).toBe('coord1');
    expect(data.coordinatorValidatedAt).toBeInstanceOf(Date);
  });

  it('Sin asistente no estampa validación del coordinador', async () => {
    const res = await request(app)
      .post('/api/makeups').send({ ...body, assistantId: undefined })
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER', 'coord1')}`);
    expect(res.status).toBe(201);
    const data = prismaMock.classSession.create.mock.calls[0][0].data;
    expect(data.coordinatorValidatedAt).toBeUndefined();
  });
});

describe('POST /api/makeups/:id/finalize — reporte como clase normal', () => {
  const body = { attendanceRecords: [{ studentId: 's1', status: 'PRESENTE' }], assistantId: 'a1' };

  beforeEach(() => {
    prismaMock.attendanceRecord = { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) };
    prismaMock.costRecord = { deleteMany: vi.fn(), createMany: vi.fn() };
    prismaMock.sessionEditLog = { create: vi.fn() };
    prismaMock.systemConfig = { findMany: vi.fn().mockResolvedValue([]) };
  });

  it('El profesor titular puede reportar', async () => {
    const res = await request(app)
      .post('/api/makeups/m1/finalize').send(body)
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(200);
    // No cambió el asistente asignado → conserva la validación del coordinador.
    const data = prismaMock.classSession.update.mock.calls[0][0].data;
    expect(data.coordinatorValidatedAt).toBeUndefined();
    expect(data.status).toBe('REALIZADA');
  });

  it('Si el profesor cambia el asistente, se limpia la validación del coordinador', async () => {
    const res = await request(app)
      .post('/api/makeups/m1/finalize').send({ ...body, assistantId: 'a2' })
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(200);
    const data = prismaMock.classSession.update.mock.calls[0][0].data;
    expect(data.coordinatorValidatedAt).toBeNull();
  });

  it('Otro profesor no puede reportarla → 403', async () => {
    prismaMock.professor.findUnique = vi.fn().mockResolvedValue({ id: 'p9', name: 'Otro' });
    const res = await request(app)
      .post('/api/makeups/m1/finalize').send(body)
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(403);
  });

  it('Quincena cerrada → 409', async () => {
    lockPeriod(true);
    const res = await request(app)
      .post('/api/makeups/m1/finalize').send(body)
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/makeups/:id/cancel — quincena cerrada', () => {
  it('→ 409', async () => {
    lockPeriod(true);
    const res = await request(app)
      .post('/api/makeups/m1/cancel').send({ cancellationCategory: 'LLUVIA' })
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(409);
  });
});
