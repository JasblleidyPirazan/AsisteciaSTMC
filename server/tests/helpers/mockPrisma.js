// The server is CommonJS (no "type":"module"), so the route/middleware graph is
// wired with `const prisma = require('../lib/prisma')` and those nested requires
// go through Node's native require.cache — which vitest's vi.mock does NOT
// intercept. To mock the DB we pre-seed require.cache with a stable mock object
// BEFORE any consumer module is loaded. Consumers capture this object by
// reference at import time and read `prisma.<model>.<method>` fresh on each
// call, so mutating the mock per-test is enough.
//
// Importing this module (statically, before importing any router) performs the
// injection as a side effect.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const prismaMock = {};

const prismaPath = require.resolve('../../src/lib/prisma');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: prismaMock,
};

// Wipe every model accessor between tests (keeps the same object reference).
export function resetPrisma() {
  for (const key of Object.keys(prismaMock)) delete prismaMock[key];
}

// Dependencias del estado derivado del estudiante (services/studentStatus.js →
// attachStudentStatus): config de tarifas + agregados de pagos y asistencia.
// Cualquier ruta que devuelva estudiantes decorados las necesita. Se hace merge
// para no pisar mocks ya configurados por el test (p. ej. studentPayment.findMany).
export async function mockStudentStatusDeps() {
  const { vi } = await import('vitest');
  prismaMock.systemConfig = { findMany: vi.fn().mockResolvedValue([]), ...(prismaMock.systemConfig || {}) };
  prismaMock.studentPayment = { groupBy: vi.fn().mockResolvedValue([]), ...(prismaMock.studentPayment || {}) };
  // attachStudentStatus: groupBy de PRESENTE + findMany de AUSENTE en festival
  // (para quienes no tienen PRESENTE, filtrado por fecha de inicio de clases).
  prismaMock.attendanceRecord = {
    groupBy: vi.fn().mockResolvedValue([]),
    findMany: vi.fn().mockResolvedValue([]),
    ...(prismaMock.attendanceRecord || {}),
  };
  // GRADUADO: semestre activo (null = sin semestre, nadie se gradúa)
  prismaMock.semester = { findFirst: vi.fn().mockResolvedValue(null), ...(prismaMock.semester || {}) };
}

// Todo lo que lee `loadLedgers` (services/studentLedger.js): semestre, estudiantes
// con matrículas, registros, sesiones, reposiciones programadas, pagos y tarifas.
// Los registros y las sesiones se filtran por estudiante/grupo como lo haría la BD.
export async function mockLedgerDeps({
  semester = null, students = [], records = [], sessions = [], scheduled = [], payments = [], config = [],
} = {}) {
  const { vi } = await import('vitest');
  prismaMock.semester = {
    findFirst: vi.fn().mockResolvedValue(semester),
    findMany: vi.fn().mockResolvedValue(semester ? [{ id: semester.id, startDate: semester.startDate }] : []),
  };
  prismaMock.student = { ...(prismaMock.student || {}) };
  prismaMock.student.findMany = vi.fn().mockImplementation(({ where } = {}) => {
    let list = students;
    if (where?.id?.in) list = list.filter((s) => where.id.in.includes(s.id));
    return Promise.resolve(list);
  });
  prismaMock.student.findUnique = vi.fn().mockImplementation(({ where }) => {
    const found = students.find((x) => x.id === where.id);
    return Promise.resolve(found ? { id: found.id, parentUserId: found.parentUserId ?? null } : null);
  });
  prismaMock.attendanceRecord = {
    findMany: vi.fn().mockImplementation(({ where } = {}) => Promise.resolve(
      where?.studentId?.in ? records.filter((r) => where.studentId.in.includes(r.studentId)) : records)),
    groupBy: vi.fn().mockResolvedValue([]),
  };
  prismaMock.classSession = { findMany: vi.fn().mockResolvedValue(sessions) };
  prismaMock.makeupParticipant = { findMany: vi.fn().mockResolvedValue(scheduled) };
  prismaMock.studentPayment = { groupBy: vi.fn().mockResolvedValue(payments) };
  prismaMock.systemConfig = {
    findMany: vi.fn().mockResolvedValue(config),
    findUnique: vi.fn().mockResolvedValue({ value: '40' }),
  };
}
