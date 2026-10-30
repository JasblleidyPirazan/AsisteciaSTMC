// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Reportes → Avance de grupos: inicio, fecha final estimada, clases dadas,
// no dadas por festivos / lluvia, y avance por estudiante.
let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

const day = (s) => new Date(`${s}T00:00:00.000Z`);
const GROUP = {
  id: 'g1', code: 'G1', ballLevel: 'Verde', subLevel: 'A', active: true, createdAt: day('2026-01-01'),
  lunes: true, martes: false, miercoles: false, jueves: false, viernes: false, sabado: false, domingo: false,
  professor: { id: 'p1', name: 'Profe' },
};
const STUDENT = {
  id: 'st1', name: 'Ana', active: true, isTrial: false, birthDate: day('2010-01-01'),
  classesAcquired: 10, previousClasses: 0, classesStartDate: null, suspendedFrom: null, suspendedUntil: null,
  enrollments: [{ groupId: 'g1', enrolledAt: day('2026-01-01'), group: GROUP }],
};

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/reports', (await import('../../src/routes/reports.js')).default);
});

beforeEach(() => {
  resetPrisma();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-17T15:00:00.000Z')); // jueves 17 sep (Bogotá)
  prismaMock.semester = {
    findFirst: vi.fn().mockResolvedValue({
      id: 's', name: '2026-2', startDate: day('2026-09-01'), endDate: day('2026-09-30'),
      exclusions: [{ date: day('2026-09-14'), reason: 'Festivo' }],
    }),
  };
  prismaMock.systemConfig = { findUnique: vi.fn().mockResolvedValue({ value: '8' }) }; // plan base 8 → 4 para un grupo de un solo día
  prismaMock.group = { findMany: vi.fn().mockResolvedValue([GROUP]) };
  // Lunes 7: realizada · lunes 14: festivo (sin sesión) · lunes 21/28: por venir
  prismaMock.classSession = {
    // La consulta de lluvia (status CANCELADA) no encuentra nada; la del grupo trae la realizada
    findMany: vi.fn().mockImplementation(({ where }) => Promise.resolve(
      where.status === 'CANCELADA' ? []
        : [{ groupId: 'g1', date: day('2026-09-07'), status: 'REALIZADA', cancellationCategory: null }]
    )),
  };
  prismaMock.student = { findMany: vi.fn().mockResolvedValue([STUDENT]) };
  prismaMock.attendanceRecord = {
    findMany: vi.fn().mockImplementation(({ where }) => {
      if (where.status === 'JUSTIFICADA') return Promise.resolve([]);
      if (JSON.stringify(where).includes('REPOSICION')) return Promise.resolve([]);
      if (where.session?.date && !where.AND) return Promise.resolve([]); // registros de hoy
      return Promise.resolve([{ studentId: 'st1', status: 'PRESENTE', session: { date: day('2026-09-07'), effectiveUnits: 1 } }]);
    }),
  };
});

describe('GET /reports/groups-progress', () => {
  it('resume el grupo: inicio, fin estimado, dadas y no dadas por festivos', async () => {
    const res = await request(app).get('/api/reports/groups-progress')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(200);
    const [g] = res.body.data.groups;
    expect(g).toMatchObject({
      code: 'G1', startDate: '2026-09-07', plan: 4, given: 1, upcoming: 3,
      holidaysLost: 1, holidaysLostPast: 1, rain: 0,
    });
    // plan: lunes 7, 14, 21, 28 → fin 28 sep. Faltan 3 desde hoy (jue 17), sin el 14: 21, 28 sep y 5 oct
    expect(g.plannedEnd).toBe('2026-09-28');
    expect(g.estimatedEnd).toBe('2026-10-05');
    expect(g.delayDays).toBe(7);
    expect(g.pct).toBe(25);
  });

  it('resumen por grupo: dónde poner el esfuerzo', async () => {
    const res = await request(app).get('/api/reports/groups-progress')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const g = res.body.data.groups[0];
    // Ana: 1 festivo ya pasado (lunes 14) NO es reposición: es clase por recuperar por calendario
    expect(g).toMatchObject({
      studentsCount: 1, studentsWithMakeups: 0, makeupClasses: 0, studentsWithCalendar: 1, calendarClasses: 1,
    });
    expect(g.students[0]).toMatchObject({ name: 'Ana', holidays: 1, pending: 0, calendar: 1 });
  });

  it('desplegable: avance de cada estudiante del grupo', async () => {
    const res = await request(app).get('/api/reports/groups-progress')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const [st] = res.body.data.groups[0].students;
    expect(st).toMatchObject({ name: 'Ana', seen: 1, total: 10, pct: 10, completed: false });
    expect(st.projectedEnd).toBeTruthy();
  });

  it('un profesor no puede verlo', async () => {
    const res = await request(app).get('/api/reports/groups-progress')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(403);
  });
});
