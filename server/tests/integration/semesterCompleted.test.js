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
  const enr = (s) => ({ ...s, enrollments: [{ groupId: 'g1', enrolledAt: new Date('2026-01-01'), group: GROUP }] });
  const rain = (d) => ({ groupId: 'g1', date: new Date(d) });
  const just = (studentId, d) => ({ studentId, session: { date: new Date(d) } });

  beforeEach(() => {
    resetPrisma();
    prismaMock.semester = {
      findFirst: vi.fn().mockResolvedValue({
        startDate: new Date('2026-01-05'), endDate: new Date('2026-12-28'), exclusions: [],
      }),
    };
    prismaMock.student = {
      findMany: vi.fn().mockResolvedValue([
        enr({ ...base, id: 'near', name: 'Casi', classesAcquired: 10 }),     // vio 8 → le faltan 2
        enr({ ...base, id: 'debt', name: 'Debe', classesAcquired: 40 }),     // 2 lluvia + 2 justificadas
        enr({ ...base, id: 'abs', name: 'Falta', classesAcquired: 40 }),     // solo ausencias: NO debe
        enr({ ...base, id: 'done', name: 'Lista', classesAcquired: 1 }),
      ]),
    };
    const seen = (id, n) => Array.from({ length: n }, (_, i) => rec(id, `2026-02-${String(i + 1).padStart(2, '0')}`));
    prismaMock.classSession = {
      findMany: vi.fn().mockResolvedValue([rain('2026-02-02'), rain('2026-02-09')]),
    };
    prismaMock.attendanceRecord = {
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (where.status === 'JUSTIFICADA') {
          return Promise.resolve([just('debt', '2026-02-16'), just('debt', '2026-02-23')]);
        }
        if (JSON.stringify(where).includes('REPOSICION')) return Promise.resolve([]);
        return Promise.resolve([...seen('near', 8), ...seen('done', 1)]); // clases vistas
      }),
    };
  });

  it('por reponer = lluvia + justificadas (la ausencia no cuenta)', async () => {
    const res = await request(alertsApp).get('/api/alerts/coordinator')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(200);
    const { makeups, nearEnd, completedCount } = res.body.data;
    const debt = makeups.find((m) => m.studentId === 'debt');
    expect(debt).toMatchObject({ pending: 4, rain: 2, justified: 2 });
    expect(makeups.map((m) => m.studentId)).not.toContain('abs');
    expect(nearEnd.map((s) => s.studentId)).toEqual(['near']);
    expect(nearEnd[0].remaining).toBe(2);
    expect(completedCount).toBe(1);
  });

  it('descuenta lo ya repuesto', async () => {
    const original = prismaMock.attendanceRecord.findMany.getMockImplementation();
    prismaMock.attendanceRecord.findMany.mockImplementation((args) =>
      JSON.stringify(args.where).includes('REPOSICION')
        ? Promise.resolve([{ studentId: 'debt', session: { effectiveUnits: 2 } }])
        : original(args));
    const res = await request(alertsApp).get('/api/alerts/coordinator')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    // debía 4, repuso 2 (una reposición doble) → 2: ya no llega al umbral de 3
    expect(res.body.data.makeups.map((m) => m.studentId)).not.toContain('debt');
  });

  it('un profesor no puede ver el panel', async () => {
    const res = await request(alertsApp).get('/api/alerts/coordinator')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(403);
  });

  it('ADMIN también lo ve', async () => {
    const res = await request(alertsApp).get('/api/alerts/coordinator')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /alerts/holidays', () => {
  it('calendario por grupo: festivos + lluvia y fecha final estimada', async () => {
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
    prismaMock.classSession = { findMany: vi.fn().mockResolvedValue([{ groupId: 'a' }]) };
    const res = await request(alertsApp).get('/api/alerts/holidays')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(200);
    const [first, second] = res.body.data.groups;
    expect(first).toMatchObject({ code: 'A1', lost: 1, rain: 1, totalLost: 2, extraVsBest: 2, estimatedEnd: '2026-10-12' });
    expect(second).toMatchObject({ code: 'B1', totalLost: 0, extraVsBest: 0 });
  });
});
