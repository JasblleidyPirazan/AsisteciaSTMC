// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Semestre completado: quien ya vio todo su paquete sale del roster del grupo.
// Panel del coordinador: ≥3 por reponer y ≤3 para terminar el semestre.
let groupsApp;
let alertsApp;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

const base = {
  active: true, isTrial: false, birthDate: new Date('2010-01-01'), previousClasses: 0,
  classesStartDate: null, suspendedFrom: null, suspendedUntil: null,
};
const DONE = { ...base, id: 'done', name: 'Completa', classesAcquired: 2 };
const LIVE = { ...base, id: 'live', name: 'En curso', classesAcquired: 10 };

const rec = (studentId, date) => ({ studentId, status: 'PRESENTE', session: { date: new Date(date), effectiveUnits: 1 } });

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  groupsApp = await buildApp('/api/groups', (await import('../../src/routes/groups.js')).default);
  alertsApp = await buildApp('/api/alerts', (await import('../../src/routes/alerts.js')).default);
});

describe('GET /groups/:id/students — semestre completado', () => {
  beforeEach(() => {
    resetPrisma();
    prismaMock.studentEnrollment = { findMany: vi.fn().mockResolvedValue([{ student: DONE }, { student: LIVE }]) };
    prismaMock.semester = { findFirst: vi.fn().mockResolvedValue(null) };
    prismaMock.attendanceRecord = {
      findMany: vi.fn().mockResolvedValue([
        rec('done', '2026-03-02'), rec('done', '2026-03-04'), rec('live', '2026-03-02'),
      ]),
      groupBy: vi.fn().mockResolvedValue([
        { studentId: 'done', _count: { _all: 2 } }, { studentId: 'live', _count: { _all: 1 } },
      ]),
    };
    prismaMock.studentPayment = { groupBy: vi.fn().mockResolvedValue([]) };
    prismaMock.systemConfig = { findMany: vi.fn().mockResolvedValue([]) };
  });

  it('oculta al estudiante que completó su paquete', async () => {
    const res = await request(groupsApp).get('/api/groups/g1/students')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.body.data.map((s) => s.id)).toEqual(['live']);
  });

  it('includeCompleted=true lo devuelve marcado', async () => {
    const res = await request(groupsApp).get('/api/groups/g1/students?includeCompleted=true')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    const done = res.body.data.find((s) => s.id === 'done');
    expect(done.semesterCompleted).toBe(true);
    expect(res.body.data.find((s) => s.id === 'live').semesterCompleted).toBe(false);
  });

  it('con ?date= solo cuentan las sesiones anteriores (puede editar la clase en que terminó)', async () => {
    await request(groupsApp).get('/api/groups/g1/students?date=2026-03-04')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    const where = prismaMock.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"lt":"2026-03-04T00:00:00.000Z"');
  });
});

describe('GET /alerts/coordinator', () => {
  const GROUP = {
    id: 'g1', code: 'G1', active: true, createdAt: new Date('2026-01-01'),
    lunes: true, martes: false, miercoles: false, jueves: false, viernes: false, sabado: false, domingo: false,
  };
  const enr = (s) => ({ ...s, enrollments: [{ enrolledAt: new Date('2026-01-01'), group: GROUP }] });

  beforeEach(() => {
    resetPrisma();
    prismaMock.semester = {
      findFirst: vi.fn().mockResolvedValue({
        startDate: new Date('2026-01-05'), endDate: new Date('2026-12-28'), exclusions: [],
      }),
    };
    // 'near' vio 8 de 10 (le faltan 2); 'late' vio 0 de 40 en un semestre de muchos lunes
    prismaMock.student = {
      findMany: vi.fn().mockResolvedValue([
        enr({ ...base, id: 'near', name: 'Casi', classesAcquired: 10 }),
        enr({ ...base, id: 'late', name: 'Atrasada', classesAcquired: 40 }),
        enr({ ...base, id: 'done', name: 'Lista', classesAcquired: 1 }),
      ]),
    };
    const seen = (id, n) => Array.from({ length: n }, (_, i) => rec(id, `2026-02-${String(i + 1).padStart(2, '0')}`));
    prismaMock.attendanceRecord = { findMany: vi.fn().mockResolvedValue([...seen('near', 8), ...seen('done', 1)]) };
  });

  it('separa los que deben reponer de los que están por terminar', async () => {
    const res = await request(alertsApp).get('/api/alerts/coordinator')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(200);
    const { makeups, nearEnd, completedCount } = res.body.data;
    expect(nearEnd.map((s) => s.studentId)).toEqual(['near']);
    expect(nearEnd[0].remaining).toBe(2);
    expect(makeups.map((s) => s.studentId)).toContain('late');
    expect(makeups.map((s) => s.studentId)).not.toContain('done'); // ya completó: no repone
    expect(completedCount).toBe(1);
  });

  it('un profesor no puede ver el panel', async () => {
    const res = await request(alertsApp).get('/api/alerts/coordinator')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /alerts/holidays', () => {
  it('devuelve las clases que cada grupo pierde por fechas excluidas', async () => {
    resetPrisma();
    prismaMock.semester = {
      findFirst: vi.fn().mockResolvedValue({
        id: 's', name: '2026-2', startDate: new Date('2026-09-01'), endDate: new Date('2026-09-30'),
        exclusions: [{ date: new Date('2026-09-14'), reason: 'Festivo' }],
      }),
    };
    prismaMock.group = {
      findMany: vi.fn().mockResolvedValue([
        { id: 'a', code: 'A1', lunes: true, createdAt: new Date('2026-01-01'), professor: null },
        { id: 'b', code: 'B1', martes: true, createdAt: new Date('2026-01-01'), professor: null },
      ]),
    };
    const res = await request(alertsApp).get('/api/alerts/holidays')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(200);
    const [first, second] = res.body.data.groups;
    expect(first).toMatchObject({ code: 'A1', lost: 1, extraVsBest: 1 });
    expect(second).toMatchObject({ code: 'B1', lost: 0, extraVsBest: 0 });
  });
});
