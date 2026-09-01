// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma, mockStudentStatusDeps } from '../helpers/mockPrisma.js';
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

const group = (id, code) => ({ id, code, ballLevel: 'Verde', professor: { name: 'Ana' }, lunes: true, miercoles: true });

// Dos estudiantes: uno con paquete consumido, otro recién preinscrito.
const STUDENTS = [
  {
    id: 's1', name: 'Alana Cortés', document: '1001', active: true, isTrial: false, birthDate: null,
    classesAcquired: 30, previousClasses: 10, classesStartDate: null,
    suspendedFrom: null, suspendedUntil: null,
    enrollments: [{ enrollmentType: 'PRIMARY', group: group('g1', 'MJ1522') }],
  },
  {
    id: 's2', name: 'Benjamín Ossa', document: null, active: true, isTrial: false, birthDate: null,
    classesAcquired: 0, previousClasses: 0, classesStartDate: null,
    suspendedFrom: null, suspendedUntil: null,
    enrollments: [],
  },
];

const RECORDS = [
  { studentId: 's1', status: 'PRESENTE', attendanceType: 'REGULAR', session: { date: new Date('2026-03-02'), kind: 'REGULAR' } },
  { studentId: 's1', status: 'AUSENTE', attendanceType: 'REGULAR', session: { date: new Date('2026-03-04'), kind: 'REGULAR' } },
  { studentId: 's1', status: 'JUSTIFICADA', attendanceType: 'REGULAR', session: { date: new Date('2026-03-06'), kind: 'REGULAR' } },
  { studentId: 's1', status: 'NO_APLICA', attendanceType: 'REGULAR', session: { date: new Date('2026-03-09'), kind: 'REGULAR' } },
  { studentId: 's1', status: 'PRESENTE', attendanceType: 'REGULAR', session: { date: new Date('2026-03-11'), kind: 'MAKEUP' } },
];

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const reportsRouter = (await import('../../src/routes/reports.js')).default;
  app = await buildApp('/api/reports', reportsRouter);
});

beforeEach(async () => {
  resetPrisma();
  prismaMock.semester = { findFirst: vi.fn().mockResolvedValue(null) };
  prismaMock.student = { findMany: vi.fn().mockResolvedValue(STUDENTS) };
  prismaMock.classSession = {
    findMany: vi.fn().mockResolvedValue([{ groupId: 'g1', date: new Date('2026-03-16') }]),
  };
  prismaMock.attendanceRecord = { findMany: vi.fn().mockResolvedValue(RECORDS) };
  prismaMock.semesterExclusion = { findMany: vi.fn().mockResolvedValue([]) };
  await mockStudentStatusDeps();
  // attachStudentStatus vuelve a leer attendanceRecord.findMany (AUSENTE en
  // festival); el mock de arriba sirve para ambas llamadas.
});

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

  it('arma la fila con los conteos, la lluvia y el estado derivado', async () => {
    const res = await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const [a, b] = res.body.data.rows;

    expect(a).toMatchObject({
      name: 'Alana Cortés', document: '1001', groupCode: 'MJ1522', professor: 'Ana',
      acquired: 40, present: 1, absent: 1, justified: 1, na: 1, makeup: 1, rain: 1, holiday: 0,
    });
    expect(a.studentStatus).toBe('INSCRITO'); // tiene asistencia
    expect(b).toMatchObject({ name: 'Benjamín Ossa', groupCode: null, acquired: 0, present: 0, rain: 0 });
  });

  it('sin semestre activo no cuenta festivos (no hay calendario de exclusiones)', async () => {
    const res = await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    expect(prismaMock.semesterExclusion.findMany).not.toHaveBeenCalled();
    expect(res.body.data.rows[0].holiday).toBe(0);
  });

  it('cuenta los festivos del semestre que caen en un día de clase del grupo', async () => {
    prismaMock.semester.findFirst = vi.fn().mockResolvedValue({
      id: 'sem1', name: '2026-1', startDate: new Date('2026-01-15'), endDate: new Date('2026-06-30'),
    });
    // 2026-03-09 lunes (sí es día del grupo) y 2026-03-13 viernes (no lo es).
    prismaMock.semesterExclusion.findMany = vi.fn().mockResolvedValue([
      { date: new Date('2026-03-09') }, { date: new Date('2026-03-13') },
    ]);
    const res = await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const [a, b] = res.body.data.rows;
    expect(a.holiday).toBe(1);
    expect(b.holiday).toBe(0); // sin grupos, no pierde clases
  });

  it('los festivos se cortan en el día de hoy (uno futuro no es clase perdida)', async () => {
    prismaMock.semester.findFirst = vi.fn().mockResolvedValue({
      id: 'sem1', name: '2026-1', startDate: new Date('2026-01-15'), endDate: new Date('2026-06-30'),
    });
    await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const where = prismaMock.semesterExclusion.findMany.mock.calls[0][0].where;
    expect(where.semesterId).toBe('sem1');
    expect(where.date.lte.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('nunca expone montos de matrícula en la tabla', async () => {
    const res = await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    for (const row of res.body.data.rows) expect(row).not.toHaveProperty('tuition');
  });

  it('sin semestre activo consulta todo el histórico (sin filtro de fecha)', async () => {
    await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const where = prismaMock.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(where.session).toBeUndefined();
  });

  it('con semestre activo acota el rango a sus fechas', async () => {
    const startDate = new Date('2026-01-15');
    const endDate = new Date('2026-06-30');
    prismaMock.semester.findFirst = vi.fn().mockResolvedValue({ id: 'sem1', name: '2026-1', startDate, endDate });
    const res = await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const where = prismaMock.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(where.session.date).toEqual({ gte: startDate, lte: endDate });
    expect(res.body.data.semester.name).toBe('2026-1');
  });

  it('from/to del query mandan sobre el semestre', async () => {
    await request(app).get('/api/reports/students-tracking?from=2026-03-01&to=2026-03-31')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const where = prismaMock.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(where.session.date.gte.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(where.session.date.lte.toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  it('la lluvia solo mira canceladas por LLUVIA de sus grupos', async () => {
    await request(app).get('/api/reports/students-tracking')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const where = prismaMock.classSession.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'CANCELADA', cancellationCategory: 'LLUVIA' });
    expect(where.groupId).toEqual({ in: ['g1'] });
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
