// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const router = (await import('../../src/routes/payroll.js')).default;
  app = await buildApp('/api/payroll', router);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.classSession = { findMany: vi.fn().mockResolvedValue([]) };
});

describe('GET /payroll/calendar', () => {
  it('deniega a no-ADMIN (403)', async () => {
    const res = await request(app).get('/api/payroll/calendar?from=2026-01-19&to=2026-01-25')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(403);
  });

  it('exige from/to válidos (400)', async () => {
    const res = await request(app).get('/api/payroll/calendar?from=x&to=2026-01-25')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    expect(res.status).toBe(400);
  });

  it('mapea presentes, costo del profesor, reposiciones y estado', async () => {
    const token = authAs('ADMIN');
    prismaMock.classSession.findMany.mockResolvedValue([
      {
        id: 's1', date: new Date('2026-01-19'), kind: 'REGULAR', title: null,
        status: 'REALIZADA', cancellationCategory: null, dictatedByOwner: true,
        group: { code: 'LM1314', startTime: '15:45', endTime: '16:30', professor: { name: 'Ricardo' } },
        substituteProfessor: null, makeupProfessor: null,
        attendanceRecords: [
          { status: 'PRESENTE', attendanceType: 'REGULAR' },
          { status: 'PRESENTE', attendanceType: 'REPOSICION' },
          { status: 'AUSENTE', attendanceType: 'REGULAR' },
        ],
        costRecords: [{ total: '38000', payeeType: 'PROFESSOR' }, { total: '12000', payeeType: 'ASSISTANT' }],
      },
    ]);
    const res = await request(app).get('/api/payroll/calendar?from=2026-01-19&to=2026-01-25')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const s = res.body.data[0];
    expect(s).toMatchObject({
      code: 'LM1314', professor: 'Ricardo', startTime: '15:45',
      present: 2, makeupCount: 1, cost: 38000, status: 'REALIZADA',
    });
  });
});
