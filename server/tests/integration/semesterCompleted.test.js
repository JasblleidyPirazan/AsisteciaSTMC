// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma, mockLedgerDeps } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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

const d = (x) => new Date(`${x}T00:00:00.000Z`);
const NO_DAYS = { lunes: false, martes: false, miercoles: false, jueves: false, viernes: false, sabado: false, domingo: false };
const GROUP = { id: 'g1', code: 'G1', active: true, createdAt: d('2026-01-01'), ballLevel: 'Verde', ...NO_DAYS, lunes: true };
const SEM = {
  id: 'sem1', name: '2026-1', startDate: d('2026-01-05'), endDate: d('2026-12-28'), active: true,
  // 2 lunes festivos ya pasados: son calendario, no reposición
  exclusions: [{ date: d('2026-03-02'), reason: 'Festivo' }, { date: d('2026-03-16'), reason: 'Festivo' }],
};
const student = (id, name, classesAcquired) => ({
  id, name, document: id, active: true, isTrial: false, birthDate: d('2010-01-01'), previousClasses: 0,
  classesStartDate: null, suspendedFrom: null, suspendedUntil: null, parentUserId: null, classesAcquired,
  enrollments: [{ groupId: 'g1', enrolledAt: d('2026-01-01'), weekdays: [], enrollmentType: 'PRIMARY', group: GROUP }],
});
const sess = (id, date, over = {}) => ({
  id, groupId: 'g1', date: d(date), kind: 'REGULAR', status: 'REALIZADA', effectiveUnits: 1,
  cancellationCategory: null, consolidationStatus: 'MATCHED', ...over,
});
const rec = (studentId, status, session) => ({ studentId, status, attendanceType: 'REGULAR', justification: null, session });
// n asistencias a clases distintas (miércoles, para no chocar con las de lunes)
const seen = (studentId, n, from = '2026-01-07') => Array.from({ length: n }, (_, i) => {
  const date = new Date(d(from).getTime() + i * 7 * 86400000).toISOString().slice(0, 10);
  return rec(studentId, 'PRESENTE', sess(`${studentId}-${i}`, date));
});

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  groupsApp = await buildApp('/api/groups', (await import('../../src/routes/groups.js')).default);
  alertsApp = await buildApp('/api/alerts', (await import('../../src/routes/alerts.js')).default);
});

afterEach(() => { vi.useRealTimers(); });

describe('GET /groups/:id/students — semestre completado (🎓 graduado)', () => {
  const DONE = student('done', 'Completa', 2);
  const LIVE = student('live', 'En curso', 10);
  const records = [...seen('done', 2, '2026-03-02'), ...seen('live', 1, '2026-03-02')];

  beforeEach(async () => {
    resetPrisma();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-01T15:00:00.000Z'));
    prismaMock.studentEnrollment = { findMany: vi.fn().mockResolvedValue([{ student: DONE }, { student: LIVE }]) };
    await mockLedgerDeps({ semester: SEM, students: [DONE, LIVE], records, sessions: records.map((r) => r.session) });
  });

  it('oculta al estudiante que completó su paquete', async () => {
    const res = await request(groupsApp).get('/api/groups/g1/students')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.body.data.map((s) => s.id)).toEqual(['live']);
  });

  it('includeCompleted=true lo devuelve marcado y con su estado GRADUADO', async () => {
    const res = await request(groupsApp).get('/api/groups/g1/students?includeCompleted=true')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    const done = res.body.data.find((s) => s.id === 'done');
    expect(done).toMatchObject({ semesterCompleted: true, studentStatus: 'GRADUADO', classesSeen: 2, classesAcquired: 2 });
    expect(res.body.data.find((s) => s.id === 'live').semesterCompleted).toBe(false);
  });

  it('con ?date= solo cuentan las sesiones anteriores (puede editar la clase en que terminó)', async () => {
    // done terminó el 2026-03-09 (su 2.ª clase): antes de esa fecha solo lleva 1
    const res = await request(groupsApp).get('/api/groups/g1/students?date=2026-03-09')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    const done = res.body.data.find((s) => s.id === 'done');
    expect(done).toMatchObject({ semesterCompleted: false, classesSeen: 1 });
  });
});

describe('GET /alerts/coordinator — Cumplimiento (D10)', () => {
  // near: le faltan 2 · debt: 2 lluvia + 2 justificadas · abs: solo lluvia · done: completó
  // pre: sin pagos (preinscrito) — D10 igual lo cuenta: tiene paquete
  const STUDENTS = [
    student('near', 'Casi', 10), student('debt', 'Debe', 40), student('abs', 'Falta', 40),
    student('done', 'Lista', 1), student('pre', 'Pre', 40),
  ];
  const RAIN = [sess('r1', '2026-02-02', { status: 'CANCELADA', cancellationCategory: 'LLUVIA' }),
    sess('r2', '2026-02-09', { status: 'CANCELADA', cancellationCategory: 'LLUVIA' })];
  const J = [rec('debt', 'JUSTIFICADA', sess('j1', '2026-02-16')), rec('debt', 'JUSTIFICADA', sess('j2', '2026-02-23'))];
  const RECORDS = [...seen('near', 8), ...seen('done', 1), ...J];

  beforeEach(async () => {
    resetPrisma();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-01T15:00:00.000Z')); // miércoles 1 abr
    await mockLedgerDeps({
      semester: SEM, students: STUDENTS, records: RECORDS,
      sessions: [...RECORDS.map((r) => r.session), ...RAIN],
      payments: ['near', 'debt', 'abs', 'done'].map((studentId) => ({ studentId, _sum: { amount: 100000 } })),
    });
  });

  it('reposición = lluvia + justificadas; los festivos van aparte, por calendario', async () => {
    const res = await request(alertsApp).get('/api/alerts/coordinator')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(200);
    const { makeups, nearEnd, completedCount, summary } = res.body.data;
    // 'debt': 2 lluvia + 2 justificadas = 4 de reposición; los 2 festivos son calendario
    expect(makeups.map((m) => m.studentId)).toEqual(['debt']);
    expect(makeups[0]).toMatchObject({ pending: 4, rain: 2, justified: 2, madeUp: 0, calendar: 2 });
    // 'abs' / 'pre' solo tienen las 2 lluvias: bajo el umbral de 3
    expect(nearEnd.map((s) => s.studentId)).toEqual(['near']);
    expect(nearEnd[0]).toMatchObject({ remaining: 2, seen: 8, total: 10 });
    expect(completedCount).toBe(1);
    // D10: todo estudiante con paquete cuenta, también el preinscrito
    expect(summary).toMatchObject({ students: 5, completed: 1, paid: 131, seen: 9, remaining: 122 });
  });

  it('las cuatro cubetas de lo que falta suman lo que falta (invariante)', async () => {
    const res = await request(alertsApp).get('/api/alerts/coordinator')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const s = res.body.data.summary;
    expect(Math.round((s.coveredByCalendar + s.scheduled + s.makeupPending + s.shortfall) * 10) / 10).toBe(s.remaining);
  });

  it('el estudiante de la lista trae su ledger para el contrato de cifras', async () => {
    const res = await request(alertsApp).get('/api/alerts/coordinator')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    expect(res.body.data.summary.semaforo).toBeTruthy();
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
