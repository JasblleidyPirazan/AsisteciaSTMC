// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma, mockLedgerDeps } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

const d = (x) => new Date(`${x}T00:00:00.000Z`);
const NO_DAYS = { lunes: false, martes: false, miercoles: false, jueves: false, viernes: false, sabado: false, domingo: false };
const G1 = {
  id: 'g1', code: 'MJ1522', active: true, createdAt: d('2026-01-01'), ballLevel: 'Verde', subLevel: 'A',
  professor: { name: 'Ana' }, ...NO_DAYS, lunes: true, miercoles: true,
};
const SEM = { id: 'sem1', name: '2026-1', startDate: d('2026-03-01'), endDate: d('2026-06-30'), active: true, exclusions: [] };

// Alana: paquete 30 + 10 previas. Benjamín: recién preinscrito, sin paquete.
const STUDENTS = [
  {
    id: 's1', name: 'Alana Cortés', document: '1001', active: true, isTrial: false, birthDate: d('2012-01-01'),
    classesAcquired: 30, previousClasses: 10, classesStartDate: null,
    suspendedFrom: null, suspendedUntil: null, parentUserId: null,
    enrollments: [{ groupId: 'g1', enrolledAt: d('2026-03-01'), weekdays: [], enrollmentType: 'PRIMARY', group: G1 }],
  },
  {
    id: 's2', name: 'Benjamín Ossa', document: null, active: true, isTrial: false, birthDate: null,
    classesAcquired: 0, previousClasses: 0, classesStartDate: null,
    suspendedFrom: null, suspendedUntil: null, parentUserId: null,
    enrollments: [],
  },
];

const sess = (id, date, over = {}) => ({
  id, groupId: 'g1', date: d(date), kind: 'REGULAR', status: 'REALIZADA', effectiveUnits: 1,
  cancellationCategory: null, consolidationStatus: 'MATCHED', ...over,
});
const rec = (status, session, attendanceType = 'REGULAR') => ({
  studentId: 's1', status, attendanceType, justification: null, session,
});
const MAKEUP = sess('m1', '2026-03-11', { kind: 'MAKEUP', groupId: null });
const RECORDS = [
  rec('PRESENTE', sess('a1', '2026-03-02')),
  rec('AUSENTE', sess('a2', '2026-03-04')),
  rec('JUSTIFICADA', sess('a3', '2026-03-06')),
  rec('NO_APLICA', sess('a4', '2026-03-09')),
  rec('PRESENTE', MAKEUP, 'REPOSICION'),
];
const RAIN = sess('r1', '2026-03-16', { status: 'CANCELADA', cancellationCategory: 'LLUVIA' });

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const reportsRouter = (await import('../../src/routes/reports.js')).default;
  app = await buildApp('/api/reports', reportsRouter);
});

beforeEach(async () => {
  resetPrisma();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-04-01T15:00:00.000Z'));
  await mockLedgerDeps({
    semester: SEM, students: STUDENTS, records: RECORDS,
    sessions: [...RECORDS.map((r) => r.session).filter((x) => x.kind === 'REGULAR'), RAIN],
  });
});

afterEach(() => { vi.useRealTimers(); });

describe('GET /reports/students-tracking — Seguimiento de Estudiantes', () => {
  it.each(['TEACHER', 'ASSISTANT', 'RECEPTION', 'PARENT'])('deniega a %s (403)', async (role) => {
    const res = await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs(role)}`);
    expect(res.status).toBe(403);
  });

  it.each(['ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER'])('permite a %s (200)', async (role) => {
    const res = await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs(role)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(2);
  });

  it('arma la fila con los conteos del ledger: la falta consume y la lluvia es informativa', async () => {
    const res = await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const a = res.body.data.rows.find((r) => r.name === 'Alana Cortés');
    const b = res.body.data.rows.find((r) => r.name === 'Benjamín Ossa');

    expect(a).toMatchObject({
      document: '1001', groupCode: 'MJ1522', professor: 'Ana',
      acquired: 40, classesAcquired: 30, previousClasses: 10,
      present: 1, absent: 1, justified: 1, na: 1, makeup: 1, rain: 1,
      total: 3, pct: 7.5, studentStatus: 'PREINSCRITO', // D7: la asistencia no cambia el estado
    });
    expect(a.ledger.consumidas.total).toBe(3);
    expect(b).toMatchObject({ groupCode: null, acquired: 0, present: 0, rain: 0, pct: null });
  });

  it('nunca expone montos de matrícula en la tabla', async () => {
    const res = await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    for (const row of res.body.data.rows) expect(row).not.toHaveProperty('tuition');
  });

  it('el rango es la ventana del semestre activo (D4)', async () => {
    const res = await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    expect(res.body.data.semester.name).toBe('2026-1');
    expect(res.body.data.from).toBe('2026-03-01');
    expect(res.body.data.to).toBeNull(); // sin semestre posterior no hay límite superior
  });

  it('sin semestre activo no hay filas', async () => {
    await mockLedgerDeps({ semester: null, students: STUDENTS });
    const res = await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toEqual([]);
  });
});

describe('GET /reports/students-tracking/export — Excel', () => {
  it('deniega a TEACHER (403)', async () => {
    const res = await request(app).get('/api/reports/students-tracking/export')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(403);
  });

  it('ADMIN descarga un xlsx', async () => {
    const res = await request(app).get('/api/reports/students-tracking/export')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('seguimiento-estudiantes');
  });
});
