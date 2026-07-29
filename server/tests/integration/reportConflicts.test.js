// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// GET /alerts/report-conflicts debe anotar el "caso de tiempos": un estudiante
// divergente que ya NO está inscrito en el grupo (lo trasladaron entre los dos
// reportes) sale con leftGroup { actionType, changedAt } para que la UI
// explique el conflicto y sugiera quitarlo del reporte.
let app;

const CHANGED_AT = new Date('2026-07-28T15:00:00.000Z');

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

function mismatchSession(students) {
  return {
    id: 'sess1',
    groupId: 'g1',
    date: new Date('2026-07-28T00:00:00.000Z'),
    group: { id: 'g1', code: 'MJ2211', name: null },
    consolidationDiff: {
      matched: false,
      dictating: { match: true },
      assistant: { match: true },
      students,
    },
  };
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const alertsRouter = (await import('../../src/routes/alerts.js')).default;
  app = await buildApp('/api/alerts', alertsRouter);
});

beforeEach(() => {
  resetPrisma();
});

function get(token) {
  return request(app).get('/api/alerts/report-conflicts').set('Authorization', `Bearer ${token}`);
}

describe('GET /api/alerts/report-conflicts — caso de tiempos (trasladado entre reportes)', () => {
  it('estudiante divergente ya no inscrito → leftGroup con el TRANSFER', async () => {
    const token = authAs('ADMIN');
    prismaMock.classSession = {
      findMany: vi.fn().mockResolvedValue([
        mismatchSession([
          { studentId: 'sX', name: 'Estudiante X', professor: 'PRESENTE', coordinator: null, match: false },
          { studentId: 'sOk', name: 'Sigue Igual', professor: 'PRESENTE', coordinator: 'PRESENTE', match: true },
        ]),
      ]),
    };
    // Ya no está inscrita en g1…
    prismaMock.studentEnrollment = { findMany: vi.fn().mockResolvedValue([]) };
    // …porque fue trasladada.
    prismaMock.studentGroupHistory = {
      findMany: vi.fn().mockResolvedValue([
        { fromGroupId: 'g1', studentId: 'sX', actionType: 'TRANSFER', changedAt: CHANGED_AT },
      ]),
    };

    const res = await get(token);
    expect(res.status).toBe(200);
    const [conflict] = res.body.data.conflicts;
    const x = conflict.diff.students.find((s) => s.studentId === 'sX');
    expect(x.leftGroup).toEqual({ actionType: 'TRANSFER', changedAt: CHANGED_AT.toISOString() });
    // El estudiante que coincide no se anota (ni se consulta su membresía como divergente).
    const ok = conflict.diff.students.find((s) => s.studentId === 'sOk');
    expect(ok.leftGroup).toBeUndefined();
  });

  it('estudiante divergente que SIGUE inscrito → sin leftGroup (conflicto normal)', async () => {
    const token = authAs('ADMIN');
    prismaMock.classSession = {
      findMany: vi.fn().mockResolvedValue([
        mismatchSession([
          { studentId: 'sY', name: 'Y', professor: 'PRESENTE', coordinator: 'AUSENTE', match: false },
        ]),
      ]),
    };
    prismaMock.studentEnrollment = {
      findMany: vi.fn().mockResolvedValue([{ groupId: 'g1', studentId: 'sY' }]),
    };
    prismaMock.studentGroupHistory = { findMany: vi.fn().mockResolvedValue([]) };

    const res = await get(token);
    expect(res.status).toBe(200);
    const y = res.body.data.conflicts[0].diff.students[0];
    expect(y.leftGroup).toBeUndefined();
  });

  it('sin divergentes no consulta membresía ni historial', async () => {
    const token = authAs('ADMIN');
    prismaMock.classSession = { findMany: vi.fn().mockResolvedValue([]) };
    prismaMock.studentEnrollment = { findMany: vi.fn() };
    prismaMock.studentGroupHistory = { findMany: vi.fn() };

    const res = await get(token);
    expect(res.status).toBe(200);
    expect(res.body.data.conflicts).toEqual([]);
    expect(prismaMock.studentEnrollment.findMany).not.toHaveBeenCalled();
    expect(prismaMock.studentGroupHistory.findMany).not.toHaveBeenCalled();
  });
});
