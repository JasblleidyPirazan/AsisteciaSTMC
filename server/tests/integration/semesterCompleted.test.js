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
        startDate: new Date('2026-01-05'), endDate: new Date('2026-12-28'),
        // 2 lunes festivos ya pasados → se suman a lo que debe 'debt'
        exclusions: [{ date: new Date('2026-03-02'), reason: 'Festivo' }, { date: new Date('2026-03-16'), reason: 'Festivo' }],
      }),
    };
    prismaMock.student = {
      findMany: vi.fn().mockResolvedValue([
        enr({ ...base, id: 'near', name: 'Casi', classesAcquired: 10 }),     // vio 8 → le faltan 2
        enr({ ...base, id: 'debt', name: 'Debe', classesAcquired: 40 }),     // 2 lluvia + 2 justificadas
        enr({ ...base, id: 'abs', name: 'Falta', classesAcquired: 40 }),     // solo ausencias: NO debe
        enr({ ...base, id: 'done', name: 'Lista', classesAcquired: 1 }),
        // Preinscrito (sin pagos ni asistencia): no entra al cumplimiento
        enr({ ...base, id: 'pre', name: 'Pre', classesAcquired: 40 }),
      ]),
    };
    // Todos han pagado algo (inscritos) salvo 'pre'
    prismaMock.studentPayment = {
      groupBy: vi.fn().mockResolvedValue(['near', 'debt', 'abs', 'done'].map((studentId) => ({ studentId, _sum: { amount: 100000 } }))),
    };
    prismaMock.systemConfig = { findMany: vi.fn().mockResolvedValue([]) };
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
      groupBy: vi.fn().mockResolvedValue([]),
    };
  });

  it('reposición = lluvia + justificadas; los festivos van aparte, por calendario', async () => {
    const res = await request(alertsApp).get('/api/alerts/coordinator')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(200);
    const { makeups, nearEnd, completedCount, summary } = res.body.data;
    // 'debt': 2 lluvia + 2 justificadas = 4 de reposición; los 2 festivos son calendario
    expect(makeups.find((m) => m.studentId === 'debt'))
      .toMatchObject({ pending: 4, rain: 2, justified: 2, calendar: 2 });
    // 'abs' solo tiene ausencias sin justificar (no suman) + 2 lluvias: 2 < umbral
    expect(makeups.find((m) => m.studentId === 'abs')).toBeUndefined();
    expect(nearEnd.map((s) => s.studentId)).toEqual(['near']);
    expect(nearEnd[0].remaining).toBe(2);
    expect(completedCount).toBe(1);
    // 'pre' (preinscrito) no aparece en ninguna lista ni suma al cumplimiento
    expect(makeups.find((m) => m.studentId === 'pre')).toBeUndefined();
    expect(res.body.data.shortfall.find((m) => m.studentId === 'pre')).toBeUndefined();
    // Cumplimiento: pagadas 10+40+40+1, vistas 8+1
    expect(summary).toMatchObject({ students: 4, completed: 1, paid: 91, seen: 9, remaining: 82 });
    // Reposición: debt 4 + abs 2 + near 2. Calendario: debt 2 + abs 2; a 'near' solo le
    // quedan 2 clases y ya las cubre la reposición (tope del paquete) → 0 por calendario
    expect(summary).toMatchObject({ makeupPending: 8, makeupStudents: 3, calendarPending: 4, calendarStudents: 2 });
  });

  it('descuenta lo ya repuesto, primero de la reposición y el excedente del calendario', async () => {
    const { computeMakeupDebt } = await import('../../src/services/semesterProgress.js');
    const original = prismaMock.attendanceRecord.findMany.getMockImplementation();
    const repuso = (units) => prismaMock.attendanceRecord.findMany.mockImplementation((args) =>
      JSON.stringify(args.where).includes('REPOSICION')
        ? Promise.resolve([{ studentId: 'debt', session: { date: new Date('2026-09-20T00:00:00Z'), kind: 'MAKEUP', title: 'Reposición', effectiveUnits: units } }])
        : original(args));
    repuso(2);
    let debt = (await computeMakeupDebt()).rows.find((r) => r.studentId === 'debt');
    expect(debt).toMatchObject({ madeUp: 2, pending: 2, calendar: 2 });
    repuso(5); // debía 4 de reposición: el excedente (1) recupera un festivo
    debt = (await computeMakeupDebt()).rows.find((r) => r.studentId === 'debt');
    expect(debt).toMatchObject({ madeUp: 5, pending: 0, calendar: 1 });
  });

  it('detalle por estudiante: lista las clases que originan la deuda', async () => {
    const { computeMakeupDebt } = await import('../../src/services/semesterProgress.js');
    const { rows } = await computeMakeupDebt();
    const debt = rows.find((r) => r.studentId === 'debt');
    const byType = (t) => debt.items.filter((i) => i.type === t).length;
    expect({ rain: byType('RAIN'), justified: byType('JUSTIFIED'), holidays: byType('HOLIDAY') })
      .toEqual({ rain: 2, justified: 2, holidays: 2 });
    expect(debt.items.map((i) => i.date)).toEqual([...debt.items.map((i) => i.date)].sort());
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
  it('calendario por grupo: plan de 40, festivos + lluvia y fecha final estimada', async () => {
    resetPrisma();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-17T15:00:00.000Z'));
    prismaMock.semester = {
      findFirst: vi.fn().mockResolvedValue({
        id: 's', name: '2026-2', startDate: new Date('2026-09-01'), endDate: new Date('2026-12-15'),
        exclusions: [{ date: new Date('2026-09-14'), reason: 'Festivo' }],
      }),
    };
    prismaMock.systemConfig = { findUnique: vi.fn().mockResolvedValue({ value: '8' }) };
    prismaMock.group = {
      findMany: vi.fn().mockResolvedValue([
        { id: 'a', code: 'A1', lunes: true, createdAt: new Date('2026-01-01'), professor: null },
        { id: 'b', code: 'B1', martes: true, createdAt: new Date('2026-01-01'), professor: null },
      ]),
    };
    // A1: el lunes 7 se dictó; B1: nada. (Sin lluvia)
    prismaMock.classSession = {
      findMany: vi.fn().mockResolvedValue([
        { groupId: 'a', date: new Date('2026-09-07'), status: 'REALIZADA', cancellationCategory: null },
      ]),
    };
    const res = await request(alertsApp).get('/api/alerts/holidays')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(200);
    expect(res.body.data.plan).toBe(8);
    const [first, second] = res.body.data.groups;
    // A1: plan lunes 7, 14, 21, 28 → fin ideal 28 sep. Real: faltan 3 desde hoy (jue 17): 21, 28 sep y 5 oct
    expect(first).toMatchObject({ code: 'A1', plannedEnd: '2026-09-28', estimatedEnd: '2026-10-05', lost: 1, totalLost: 1, extraVsBest: 1 });
    expect(second).toMatchObject({ code: 'B1', lost: 0, totalLost: 0, extraVsBest: 0 });
    vi.useRealTimers();
  });
});
