// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// /api/ledger — cargador loadLedgers + los tres endpoints (brief §1.5).
let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}
const get = (path, role, id) => request(app).get(`/api/ledger${path}`).set('Authorization', `Bearer ${authAs(role, id)}`);

const d = (s) => new Date(`${s}T00:00:00.000Z`);
const NO_DAYS = { lunes: false, martes: false, miercoles: false, jueves: false, viernes: false, sabado: false, domingo: false };
const G1 = {
  id: 'g1', code: 'G1', active: true, createdAt: d('2026-07-01'), professorId: 'p1',
  ballLevel: 'Verde', subLevel: 'A', ...NO_DAYS, lunes: true, miercoles: true,
};
const SEM = {
  id: 'sem1', name: '2026-2', startDate: d('2026-08-01'), endDate: d('2026-11-30'), active: true,
  exclusions: [{ date: d('2026-10-12'), reason: 'Festivo' }],
};
const mkStudent = (id, name, over = {}) => ({
  id, name, document: `doc-${id}`, active: true, isTrial: false, birthDate: d('2012-05-01'),
  classesAcquired: 40, previousClasses: 0, classesStartDate: d('2026-08-03'),
  suspendedFrom: null, suspendedUntil: null, parentUserId: null,
  enrollments: [{ groupId: 'g1', enrolledAt: d('2026-08-01'), weekdays: [], enrollmentType: 'PRIMARY', group: G1 }],
  ...over,
});
// Aria: 40 clases, casi nada reportado → ROJO. Caro: paquete chico y todo al día → VERDE. Beto: sin paquete.
const ARIA = mkStudent('st1', 'Aria Uscátegui', { parentUserId: 'parent1' });
const BETO = mkStudent('st2', 'Beto Sin Paquete', { classesAcquired: 0 });
const CARO = mkStudent('st3', 'Caro Ríos', {
  classesAcquired: 10, classesStartDate: d('2026-10-14'),
  enrollments: [{ groupId: 'g1', enrolledAt: d('2026-10-14'), weekdays: [], enrollmentType: 'PRIMARY', group: G1 }],
});
const STUDENTS = [ARIA, BETO, CARO];

const sess = (id, date, status = 'REALIZADA') => ({
  id, groupId: 'g1', date: d(date), kind: 'REGULAR', status, effectiveUnits: 1, title: null,
  cancellationCategory: null, consolidationStatus: 'MATCHED',
});
const S_A1 = sess('a1', '2026-08-03');
const S_C1 = sess('c1', '2026-10-14');
const RECORDS = [
  { studentId: 'st1', status: 'PRESENTE', attendanceType: 'REGULAR', justification: null, session: S_A1 },
  { studentId: 'st3', status: 'PRESENTE', attendanceType: 'REGULAR', justification: null, session: S_C1 },
];

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/ledger', (await import('../../src/routes/ledger.js')).default);
});

beforeEach(() => {
  resetPrisma();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T15:00:00.000Z')); // jueves 15 oct (Bogotá)

  prismaMock.semester = {
    findFirst: vi.fn().mockResolvedValue(SEM),
    findMany: vi.fn().mockResolvedValue([{ id: 'sem1', startDate: d('2026-08-01') }]),
  };
  prismaMock.student = {
    findMany: vi.fn().mockImplementation(({ where }) => {
      let list = STUDENTS;
      if (where?.id?.in) list = list.filter((s) => where.id.in.includes(s.id));
      const gids = where?.enrollments?.some?.groupId?.in;
      if (gids) list = list.filter((s) => s.enrollments.some((e) => gids.includes(e.groupId)));
      return Promise.resolve(list);
    }),
    findUnique: vi.fn().mockImplementation(({ where }) => {
      const s = STUDENTS.find((x) => x.id === where.id);
      return Promise.resolve(s ? { id: s.id, parentUserId: s.parentUserId } : null);
    }),
  };
  prismaMock.attendanceRecord = {
    findMany: vi.fn().mockImplementation(({ where }) =>
      Promise.resolve(RECORDS.filter((r) => where.studentId.in.includes(r.studentId)))),
  };
  prismaMock.classSession = { findMany: vi.fn().mockResolvedValue([S_A1, S_C1]) };
  prismaMock.makeupParticipant = { findMany: vi.fn().mockResolvedValue([]) };
  prismaMock.studentPayment = { groupBy: vi.fn().mockResolvedValue([{ studentId: 'st1', _sum: { amount: 100000 } }]) };
  prismaMock.systemConfig = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ value: '40' }),
  };
  prismaMock.group = { findMany: vi.fn().mockResolvedValue([{ ...G1, professor: { id: 'p1', name: 'Profe' } }]) };
  prismaMock.professor = { findUnique: vi.fn().mockResolvedValue({ id: 'p1', userId: 'u1' }) };
  prismaMock.studentEnrollment = { findFirst: vi.fn().mockResolvedValue({ studentId: 'st1', groupId: 'g1' }) };
});

afterEach(() => vi.useRealTimers());

describe('GET /api/ledger — lista y resumen', () => {
  it('ADMIN recibe semestre, resumen y un ledger por estudiante activo', async () => {
    const res = await get('', 'ADMIN');
    expect(res.status).toBe(200);
    const { semester, window, summary, ledgers } = res.body.data;
    expect(semester).toMatchObject({ id: 'sem1', name: '2026-2' });
    expect(window).toEqual({ from: '2026-08-01', to: null });
    expect(ledgers.map((l) => l.name).sort()).toEqual(['Aria Uscátegui', 'Beto Sin Paquete', 'Caro Ríos']);
    // El ledger trae sus cifras y el semáforo del servidor
    const aria = ledgers.find((l) => l.studentId === 'st1');
    expect(aria).toMatchObject({ status: 'INSCRITO', semaforo: 'ROJO' });
    expect(aria.paquete.total).toBe(40);
    expect(aria.consumidas.total).toBe(1);
    expect(aria.pendientes.total).toBe(39);
    expect(aria.groups).toEqual([{ id: 'g1', code: 'G1', enrollmentType: 'PRIMARY' }]);
    expect(ledgers.find((l) => l.studentId === 'st3').semaforo).toBe('VERDE');
    expect(summary).toBeTruthy();
  });

  it('el resumen solo cuenta estudiantes con paquete > 0 (D10)', async () => {
    const { summary } = (await get('', 'ADMIN')).body.data;
    expect(summary.students).toBe(2);          // Beto (sin paquete) queda fuera
    expect(summary.paquete).toBe(50);          // 40 + 10
    expect(summary.consumidas).toBe(2);        // 1 + 1, topadas en el paquete
    expect(summary.pct).toBe(4);
    expect(summary.semaforo).toEqual({ VERDE: 1, AMBAR: 0, ROJO: 1, GRIS: 0 });
    // Lo que falta se reparte exactamente en las cuatro cubetas
    const p = summary.pendientes;
    expect(p.total).toBe(48);
    expect(p.cubreCalendario + p.agendadasAplicadas + p.porAgendar + p.deficit).toBe(p.total);
  });

  it('ordena lo urgente primero (déficit) y el ROJO antes que el VERDE', async () => {
    const { ledgers } = (await get('', 'ADMIN')).body.data;
    expect(ledgers[0].studentId).toBe('st1');
  });

  it('filtra por semáforo y valida el valor', async () => {
    const red = (await get('?semaforo=rojo', 'ADMIN')).body.data;
    expect(red.ledgers.map((l) => l.studentId)).toEqual(expect.arrayContaining(['st1']));
    expect(red.ledgers.every((l) => l.semaforo === 'ROJO')).toBe(true);
    // el resumen NO cambia con el filtro: los contadores siguen sumando el total
    expect(red.summary.students).toBe(2);
    expect((await get('?semaforo=azul', 'ADMIN')).status).toBe(400);
  });

  it('busca por nombre (sin tildes ni mayúsculas) o documento', async () => {
    expect((await get('?q=uscategui', 'ADMIN')).body.data.ledgers.map((l) => l.studentId)).toEqual(['st1']);
    expect((await get('?q=DOC-st3', 'ADMIN')).body.data.ledgers.map((l) => l.studentId)).toEqual(['st3']);
    expect((await get('?q=zzz', 'ADMIN')).body.data.ledgers).toEqual([]);
  });

  it('filtra por grupo (solo matriculados en ese grupo)', async () => {
    await get('?groupId=g1', 'ADMIN');
    expect(prismaMock.student.findMany.mock.calls[0][0].where.enrollments).toEqual({ some: { groupId: { in: ['g1'] } } });
    const none = await get('?groupId=gX', 'ADMIN');
    expect(none.body.data.ledgers).toEqual([]);
  });

  it('sin semestre activo: ledgers vacíos', async () => {
    prismaMock.semester.findFirst.mockResolvedValue(null);
    const res = await get('', 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body.data.semester).toBeNull();
    expect(res.body.data.ledgers).toEqual([]);
  });

  it('una sola consulta por tabla, no una por estudiante', async () => {
    await get('', 'ADMIN');
    expect(prismaMock.student.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.attendanceRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.classSession.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.makeupParticipant.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.studentPayment.groupBy).toHaveBeenCalledTimes(1);
  });

  it('la ventana (D4) llega a las consultas: desde el inicio del semestre, sin tope si no hay otro', async () => {
    await get('', 'ADMIN');
    const where = prismaMock.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(where.session.date).toEqual({ gte: d('2026-08-01') });
    // con un semestre posterior, la ventana termina (exclusiva) en su inicio
    prismaMock.semester.findMany.mockResolvedValue([
      { id: 'sem1', startDate: d('2026-08-01') }, { id: 'sem2', startDate: d('2027-02-01') },
    ]);
    await get('', 'ADMIN');
    expect(prismaMock.attendanceRecord.findMany.mock.calls[1][0].where.session.date).toEqual({ gte: d('2026-08-01'), lt: d('2027-02-01') });
  });
});

describe('GET /api/ledger — roles y monto de matrícula', () => {
  it('ADMIN y SUPERADMIN ven `tuition`', async () => {
    for (const role of ['ADMIN', 'SUPERADMIN']) {
      const l = (await get('', role)).body.data.ledgers[0];
      expect(l.tuition).toBeDefined();
    }
  });

  it('Recepción y Coordinador reciben el ledger SIN tuition', async () => {
    for (const role of ['RECEPTION', 'PHYSICAL_TRAINER']) {
      const res = await get('', role);
      expect(res.status).toBe(200);
      for (const l of res.body.data.ledgers) expect(l).not.toHaveProperty('tuition');
    }
  });

  it('Profesor, Asistente y Padre no pueden listar → 403', async () => {
    for (const role of ['TEACHER', 'ASSISTANT', 'PARENT']) {
      expect((await get('', role)).status).toBe(403);
    }
  });
});

describe('GET /api/ledger/:studentId', () => {
  it('ADMIN: el ledger individual es el mismo que el de la lista (una sola fuente)', async () => {
    const single = (await get('/st1', 'ADMIN')).body.data;
    const fromList = (await get('', 'ADMIN')).body.data.ledgers.find((l) => l.studentId === 'st1');
    expect(single).toEqual(fromList);
    // y pide solo a ese estudiante
    expect(prismaMock.student.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['st1'] } });
  });

  it('404 si el estudiante no existe', async () => {
    expect((await get('/nope', 'ADMIN')).status).toBe(404);
  });

  it('Coordinador y Recepción lo ven sin tuition', async () => {
    for (const role of ['PHYSICAL_TRAINER', 'RECEPTION']) {
      const res = await get('/st1', role);
      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('tuition');
    }
  });

  it('Profesor: solo estudiantes de grupos donde es titular', async () => {
    expect((await get('/st1', 'TEACHER')).status).toBe(200);
    expect(prismaMock.studentEnrollment.findFirst.mock.calls[0][0].where).toEqual({ studentId: 'st1', group: { professorId: 'p1' } });
    expect((await get('/st1', 'TEACHER')).body.data).not.toHaveProperty('tuition');

    prismaMock.studentEnrollment.findFirst.mockResolvedValue(null); // no es su grupo
    expect((await get('/st1', 'TEACHER')).status).toBe(403);
    // sin ficha de profesor vinculada
    prismaMock.studentEnrollment.findFirst.mockResolvedValue({ studentId: 'st1' });
    prismaMock.professor.findUnique.mockResolvedValue(null);
    expect((await get('/st1', 'TEACHER')).status).toBe(403);
  });

  it('Padre: solo su hijo (y ve el monto de matrícula de su hijo)', async () => {
    const own = await get('/st1', 'PARENT', 'parent1');
    expect(own.status).toBe(200);
    expect(own.body.data.tuition).toBeDefined();
    expect((await get('/st2', 'PARENT', 'parent1')).status).toBe(403); // hijo de otro
    expect((await get('/st1', 'PARENT', 'otroPadre')).status).toBe(403);
  });

  it('Asistente → 403', async () => {
    expect((await get('/st1', 'ASSISTANT')).status).toBe(403);
  });

  it('sin semestre activo → data null', async () => {
    prismaMock.semester.findFirst.mockResolvedValue(null);
    const res = await get('/st1', 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('"groups" no se confunde con un id de estudiante', async () => {
    const res = await get('/groups', 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body.data.groups).toBeDefined();
    expect(prismaMock.student.findUnique).not.toHaveBeenCalled();
  });
});

describe('GET /api/ledger/groups', () => {
  it('por grupo: plan, dadas, festivos, lluvia, fin estimado y agregados de sus estudiantes', async () => {
    const res = await get('/groups', 'ADMIN');
    expect(res.status).toBe(200);
    const [g] = res.body.data.groups;
    expect(g).toMatchObject({ groupId: 'g1', code: 'G1', plan: 40 });
    expect(g.professor).toEqual({ id: 'p1', name: 'Profe' });
    expect(g.dadas).toBe(2);                   // dos clases REALIZADA (3 ago y 14 oct)
    expect(g.festivos).toBe(1);                // lunes 12 de octubre
    expect(g.festivosFechas).toEqual([{ date: '2026-10-12', reason: 'Festivo' }]);
    expect(g.lluvia).toBe(0);
    expect(g.finEstimado).toBeTruthy();
    // Estudiantes del grupo: Aria (déficit) y Caro; Beto no tiene paquete
    expect(g.students.total).toBe(3);
    expect(g.students.conPaquete).toBe(2);
    expect(g.students.conDeficit).toBe(1);
    expect(g.students.deficit).toBeGreaterThan(0);
    expect(g.students.semaforo).toEqual({ VERDE: 1, AMBAR: 0, ROJO: 1, GRIS: 0 });
  });

  it('solo ADMIN, SUPERADMIN y Coordinador', async () => {
    for (const role of ['ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER']) expect((await get('/groups', role)).status).toBe(200);
    for (const role of ['RECEPTION', 'TEACHER', 'ASSISTANT', 'PARENT']) expect((await get('/groups', role)).status).toBe(403);
  });

  it('sin semestre activo: lista vacía', async () => {
    prismaMock.semester.findFirst.mockResolvedValue(null);
    const res = await get('/groups', 'ADMIN');
    expect(res.body.data).toEqual({ semester: null, groups: [] });
  });
});
