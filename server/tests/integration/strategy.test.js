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

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const reportsRouter = (await import('../../src/routes/reports.js')).default;
  app = await buildApp('/api/reports', reportsRouter);
});

beforeEach(async () => {
  resetPrisma();
  prismaMock.semester = { findFirst: vi.fn().mockResolvedValue(null) };
  prismaMock.student = { findMany: vi.fn().mockResolvedValue([]) };
  prismaMock.group = { findMany: vi.fn().mockResolvedValue([]) };
  prismaMock.classSession = { findMany: vi.fn().mockResolvedValue([]) };
  prismaMock.attendanceRecord = { findMany: vi.fn().mockResolvedValue([]) };
  prismaMock.studentPayment = { findMany: vi.fn().mockResolvedValue([]) };
  prismaMock.costRecord = { findMany: vi.fn().mockResolvedValue([]) };
  // Estado derivado de estudiantes (attachStudentStatus): config + agregados
  await mockStudentStatusDeps();
});

describe('GET /reports/strategy — Visión Estratégica', () => {
  it.each(['TEACHER', 'PHYSICAL_TRAINER', 'ASSISTANT', 'RECEPTION', 'PARENT'])(
    'deniega a %s (403) — incluye finanzas', async (role) => {
      const res = await request(app).get('/api/reports/strategy')
        .set('Authorization', `Bearer ${authAs(role)}`);
      expect(res.status).toBe(403);
    }
  );

  it.each(['ADMIN', 'SUPERADMIN'])('%s recibe la estructura completa (200)', async (role) => {
    const res = await request(app).get('/api/reports/strategy')
      .set('Authorization', `Bearer ${authAs(role)}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toHaveProperty('students');
    expect(d).toHaveProperty('groups');
    expect(d).toHaveProperty('operations');
    expect(d).toHaveProperty('alerts');
    expect(d).toHaveProperty('finance');
    expect(d.semester).toBeNull(); // sin semestre activo → ventana de 90 días
  });

  it('agrega correctamente estudiantes, grupos, operación y finanzas', async () => {
    const token = authAs('ADMIN');
    // Estados derivados: s1 adulto con el plan de 40 clases pagado completo
    // (2.789.000) → MATRICULADO; s2 pequeño sin pagos ni asistencia →
    // PREINSCRITO; s3 clase de prueba → PRUEBA (no cuenta como activo).
    prismaMock.student.findMany.mockResolvedValue([
      { id: 's1', active: true, isTrial: false, birthDate: new Date('1990-01-01'), classesAcquired: 40, suspendedFrom: null, suspendedUntil: null, createdAt: new Date() },
      { id: 's2', active: true, isTrial: false, birthDate: new Date('2015-01-01'), classesAcquired: 40, suspendedFrom: null, suspendedUntil: null, createdAt: new Date('2020-01-01') },
      { id: 's3', active: true, isTrial: true, birthDate: null, classesAcquired: 0, suspendedFrom: null, suspendedUntil: null, createdAt: new Date() },
    ]);
    prismaMock.studentPayment.groupBy.mockResolvedValue([
      { studentId: 's1', _sum: { amount: '2789000' } },
    ]);
    prismaMock.group.findMany.mockResolvedValue([
      { id: 'g1', code: 'G2', ballLevel: 'Verde', subLevel: 'A', capacity: 8, professor: { name: 'Ana' }, _count: { enrollments: 6 } },
      { id: 'g2', code: 'G10', ballLevel: 'Roja', subLevel: null, capacity: 6, professor: { name: 'Luis' }, _count: { enrollments: 2 } },
    ]);
    prismaMock.classSession.findMany.mockResolvedValue([
      { groupId: 'g1', status: 'REALIZADA', cancellationCategory: null },
      { groupId: 'g1', status: 'CANCELADA', cancellationCategory: 'LLUVIA' },
      { groupId: 'g2', status: 'REALIZADA', cancellationCategory: null },
    ]);
    prismaMock.attendanceRecord.findMany.mockResolvedValue([
      { status: 'PRESENTE', session: { groupId: 'g1' } },
      { status: 'PRESENTE', session: { groupId: 'g1' } },
      { status: 'AUSENTE', session: { groupId: 'g1' } },
      { status: 'JUSTIFICADA', session: { groupId: 'g1' } }, // no penaliza
      { status: 'PRESENTE', session: { groupId: 'g2' } },
    ]);
    prismaMock.studentPayment.findMany.mockResolvedValue([{ amount: '300000' }, { amount: '200000' }]);
    prismaMock.costRecord.findMany.mockResolvedValue([
      { payStatus: 'PAYABLE', total: '100000', paidAt: new Date() },
      { payStatus: 'PAYABLE', total: '50000', paidAt: null },
      { payStatus: 'SUSPENDED_LATE', total: '45000', paidAt: null },
    ]);

    const res = await request(app).get('/api/reports/strategy')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const d = res.body.data;

    // Estudiantes: el de prueba no cuenta como activo; conversión 1/2 = 50%
    expect(d.students).toMatchObject({ active: 2, matriculados: 1, inscritos: 0, preinscritos: 1, trial: 1, conversionPct: 50 });

    // Grupos: orden alfanumérico (G2 antes que G10), ocupación y asistencia
    expect(d.groups.rows.map((g) => g.code)).toEqual(['G2', 'G10']);
    expect(d.groups.rows[0]).toMatchObject({
      occupancyPct: 75, attendanceRate: 67, realized: 1, cancelled: 1, cancelledRain: 1,
    });
    expect(d.groups).toMatchObject({ totalEnrolled: 8, totalCapacity: 14, occupancyPct: 57, freeSpots: 6 });

    // Operación: 2 realizadas, 1 cancelada (lluvia) → cumplimiento 67%
    expect(d.operations).toMatchObject({ realized: 2, cancelled: 1, cancelledRain: 1, compliancePct: 67, avgAttendance: 75 });

    // Finanzas: 500k ingresos − 150k causado = 350k (retenido fuera del neto)
    expect(d.finance).toMatchObject({
      income: 500000, expensesAccrued: 150000, expensesPaid: 100000,
      expensesRetained: 45000, net: 350000, marginPct: 70,
    });

    // Ingresos = TODOS los pagos del sistema (sin filtro de fecha): los pagos
    // pertenecen al semestre aunque se hayan recibido antes de su inicio.
    expect(prismaMock.studentPayment.findMany).toHaveBeenCalledWith({ select: { amount: true } });
  });
});
