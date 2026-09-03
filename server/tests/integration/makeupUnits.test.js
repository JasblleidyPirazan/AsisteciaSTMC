// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Una reposición grupal se programa sencilla (cuenta por 1 asistencia) o doble
// (cuenta por 2). Ese valor vive en ClassSession.effectiveUnits y debe llegar
// hasta el conteo de clases del estudiante — no solo al pago del profesor.

let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

const STUDENT = {
  id: 'st1', name: 'Ana', active: true, isTrial: false,
  birthDate: new Date('2010-01-01'), classesAcquired: 40, previousClasses: 0,
  classesStartDate: null, suspendedFrom: null, suspendedUntil: null,
};

// Registros: 3 clases regulares + 1 reposición DOBLE = 5 clases vistas.
const RECORDS = [
  { studentId: 'st1', status: 'PRESENTE', session: { date: new Date('2026-03-02'), effectiveUnits: 1 } },
  { studentId: 'st1', status: 'PRESENTE', session: { date: new Date('2026-03-04'), effectiveUnits: 1 } },
  { studentId: 'st1', status: 'PRESENTE', session: { date: new Date('2026-03-06'), effectiveUnits: 1 } },
  { studentId: 'st1', status: 'PRESENTE', session: { date: new Date('2026-03-10'), effectiveUnits: 2 } },
];

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const groupsRouter = (await import('../../src/routes/groups.js')).default;
  app = await buildApp('/api/groups', groupsRouter);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.studentEnrollment = {
    findMany: vi.fn().mockResolvedValue([{ student: STUDENT }]),
  };
  prismaMock.semester = { findFirst: vi.fn().mockResolvedValue(null) };
  prismaMock.attendanceRecord = {
    findMany: vi.fn().mockResolvedValue(RECORDS),
    // attachStudentStatus ya ve asistencia, así que no consulta festivales
    groupBy: vi.fn().mockResolvedValue([{ studentId: 'st1', _count: { _all: 4 } }]),
  };
  // attachStudentStatus: sin pagos y sin tarifas configuradas
  prismaMock.studentPayment = { groupBy: vi.fn().mockResolvedValue([]) };
  prismaMock.systemConfig = { findMany: vi.fn().mockResolvedValue([]) };
});

describe('GET /groups/:id/students — clases vistas con reposiciones dobles', () => {
  it('la reposición doble suma 2 clases vistas, no 1', async () => {
    const res = await request(app).get('/api/groups/g1/students')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);

    expect(res.status).toBe(200);
    // 3 regulares + 1 doble = 5 (contando la doble como 1 daría 4)
    expect(res.body.data[0].classesSeen).toBe(5);
  });

  it('pide effectiveUnits a la BD para poder ponderar', async () => {
    await request(app).get('/api/groups/g1/students')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);

    const select = prismaMock.attendanceRecord.findMany.mock.calls[0][0].select;
    expect(select.session.select.effectiveUnits).toBe(true);
  });

  it('sin effectiveUnits (sesiones legadas) cada clase vale 1', async () => {
    prismaMock.attendanceRecord.findMany = vi.fn().mockResolvedValue([
      { studentId: 'st1', status: 'PRESENTE', session: { date: new Date('2026-03-02') } },
      { studentId: 'st1', status: 'PRESENTE', session: { date: new Date('2026-03-04') } },
    ]);
    const res = await request(app).get('/api/groups/g1/students')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);

    expect(res.body.data[0].classesSeen).toBe(2);
  });
});
