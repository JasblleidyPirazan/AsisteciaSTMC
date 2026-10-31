// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma, mockLedgerDeps } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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

const d = (x) => new Date(`${x}T00:00:00.000Z`);
const NO_DAYS = { lunes: false, martes: false, miercoles: false, jueves: false, viernes: false, sabado: false, domingo: false };
const G1 = { id: 'g1', code: 'G1', active: true, createdAt: d('2026-01-01'), ballLevel: 'Verde', ...NO_DAYS, lunes: true };
const SEM = { id: 'sem1', name: '2026-1', startDate: d('2026-03-01'), endDate: d('2026-06-30'), active: true, exclusions: [] };
const STUDENT = {
  id: 'st1', name: 'Ana', document: '1', active: true, isTrial: false,
  birthDate: d('2010-01-01'), classesAcquired: 40, previousClasses: 0,
  classesStartDate: null, suspendedFrom: null, suspendedUntil: null, parentUserId: null,
  enrollments: [{ groupId: 'g1', enrolledAt: d('2026-03-01'), weekdays: [], enrollmentType: 'PRIMARY', group: G1 }],
};
const session = (id, date, over = {}) => ({
  id, groupId: 'g1', date: d(date), kind: 'REGULAR', status: 'REALIZADA', effectiveUnits: 1,
  cancellationCategory: null, consolidationStatus: 'MATCHED', ...over,
});
const present = (s, attendanceType = 'REGULAR') => ({
  studentId: 'st1', status: 'PRESENTE', attendanceType, justification: null, session: s,
});

// 3 clases regulares + 1 reposición DOBLE = 5 clases vistas.
const RECORDS = [
  present(session('a', '2026-03-02')),
  present(session('b', '2026-03-09')),
  present(session('c', '2026-03-16')),
  present(session('m', '2026-03-10', { kind: 'MAKEUP', groupId: null, effectiveUnits: 2 }), 'REPOSICION'),
];

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const groupsRouter = (await import('../../src/routes/groups.js')).default;
  app = await buildApp('/api/groups', groupsRouter);
});

beforeEach(async () => {
  resetPrisma();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-04-01T15:00:00.000Z'));
  prismaMock.studentEnrollment = { findMany: vi.fn().mockResolvedValue([{ student: STUDENT }]) };
  await mockLedgerDeps({ semester: SEM, students: [STUDENT], records: RECORDS, sessions: RECORDS.map((r) => r.session) });
});

afterEach(() => { vi.useRealTimers(); });

describe('GET /groups/:id/students — clases vistas con reposiciones dobles', () => {
  it('la reposición doble suma 2 clases vistas, no 1', async () => {
    const res = await request(app).get('/api/groups/g1/students')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);

    expect(res.status).toBe(200);
    // 3 regulares + 1 doble = 5 (contando la doble como 1 daría 4)
    expect(res.body.data[0].classesSeen).toBe(5);
    expect(res.body.data[0].classesAcquired).toBe(40);
  });

  it('sin effectiveUnits válido (sesiones legadas) cada clase vale 1', async () => {
    const legacy = [
      present(session('a', '2026-03-02', { effectiveUnits: null })),
      present(session('b', '2026-03-09', { effectiveUnits: 0 })),
    ];
    await mockLedgerDeps({ semester: SEM, students: [STUDENT], records: legacy, sessions: legacy.map((r) => r.session) });
    const res = await request(app).get('/api/groups/g1/students')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);

    expect(res.body.data[0].classesSeen).toBe(2);
  });

  it('una falta a la reposición doble también consume 2 (la perdió)', async () => {
    const recs = [{ ...RECORDS[3], status: 'AUSENTE' }];
    await mockLedgerDeps({ semester: SEM, students: [STUDENT], records: recs, sessions: [] });
    const res = await request(app).get('/api/groups/g1/students')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);

    expect(res.body.data[0].classesSeen).toBe(2);
  });
});
