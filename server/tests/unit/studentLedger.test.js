import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildLedger } = require('../../src/services/studentLedger');
const { roundUnits: round1 } = require('../../src/services/attendanceStats');

// Fixtures del brief (docs/brief-implementacion.md, sección 3):
// semestre 2026-08-01 → 2026-11-30; el siguiente empieza 2027-02-01 (ventana
// hasta esa fecha); hoy 2026-10-15; exclusión: lunes 2026-10-12.

const NO_DAYS = { lunes: false, martes: false, miercoles: false, jueves: false, viernes: false, sabado: false, domingo: false };
const G1 = { id: 'g1', code: 'G1', active: true, createdAt: '2026-07-01', ...NO_DAYS, lunes: true, miercoles: true };
const G_LMV = { id: 'g3', code: 'LMV', active: true, createdAt: '2026-07-01', ...NO_DAYS, lunes: true, miercoles: true, viernes: true };

const base = (over = {}) => ({
  student: {
    id: 'st1', name: 'Aria', isTrial: false, active: true,
    classesAcquired: 40, previousClasses: 0, classesStartDate: '2026-08-03',
    suspendedFrom: null, suspendedUntil: null,
  },
  enrollments: [{ groupId: 'g1', enrolledAt: '2026-08-01', weekdays: null, group: G1 }],
  records: [],
  sessions: [],
  scheduled: [],
  exclusions: ['2026-10-12'],
  window: { from: '2026-08-01', to: '2027-02-01' },
  semesterEnd: '2026-11-30',
  today: '2026-10-15',
  tuition: { totalPaid: 0, expectedTotal: null },
  ...over,
});

// Sesión REGULAR de un grupo
const sess = (id, date, status = 'REALIZADA', category = null, extra = {}) => ({
  id, groupId: 'g1', date, kind: 'REGULAR', status, cancellationCategory: category, consolidationStatus: null, ...extra,
});
// Registro de asistencia del estudiante en una sesión
const rec = (status, session, extra = {}) => ({
  status,
  attendanceType: 'REGULAR',
  session: { id: session.id, date: session.date, kind: session.kind || 'REGULAR', status: session.status, effectiveUnits: 1, groupId: session.groupId || 'g1', ...(session.session || {}) },
  ...extra,
});

// Fechas de clase (lunes y miércoles) entre dos fechas, saltando excluidas
function classDates(from, to, skip = ['2026-10-12']) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const s = d.toISOString().slice(0, 10);
    if ([1, 3].includes(d.getUTCDay()) && !skip.includes(s)) out.push(s);
  }
  return out;
}

describe('buildLedger — Caso A: Aria (caso completo)', () => {
  // 21 clases esperadas (lun y mié) del 3 ago al 14 oct, sin el festivo del 12
  const dates = classDates('2026-08-03', '2026-10-14');
  const special = { '2026-09-02': ['CANCELADA', 'LLUVIA'], '2026-09-09': ['CANCELADA', 'OTRA'], '2026-09-16': ['CANCELADA', 'SIN_ESTUDIANTES'], '2026-10-14': ['PROGRAMADA', null] };
  const sessions = dates.map((date) => {
    const [status, cat] = special[date] || ['REALIZADA', null];
    return sess(`s${date}`, date, status, cat);
  });
  // Las 17 clases realizadas con registro: 12 P + 3 A + 2 J
  const held = sessions.filter((s) => s.status === 'REALIZADA');
  const statuses = [...Array(12).fill('PRESENTE'), ...Array(3).fill('AUSENTE'), ...Array(2).fill('JUSTIFICADA')];
  // 1 NO_APLICA en una clase extra (sábado reprogramado)
  const extra = sess('extra', '2026-08-08');
  const makeup = { id: 'm1', date: '2026-09-26', kind: 'MAKEUP', status: 'REALIZADA', groupId: null };
  const input = base({
    sessions: [...sessions, extra],
    records: [
      ...held.map((s, i) => rec(statuses[i], s)),
      rec('NO_APLICA', extra),
      rec('PRESENTE', makeup, { attendanceType: 'REPOSICION' }),
    ],
    scheduled: [{ sessionId: 'm2', date: '2026-10-17', effectiveUnits: 1 }],
  });
  const l = buildLedger(input);

  it('hay 21 clases esperadas, 17 realizadas con registro (fixture coherente)', () => {
    expect(dates).toHaveLength(21);
    expect(held).toHaveLength(17);
  });
  it('consumidas', () => {
    expect(l.consumidas).toEqual({ presentes: 12, ausentes: 4, reposicionesVistas: 1, total: 17, excedente: 0 });
  });
  it('noConsumen', () => {
    expect(l.noConsumen).toEqual({ justificadas: 2, na: 1 });
  });
  it('reposicion', () => {
    expect(l.reposicion).toMatchObject({ lluvia: 1, otras: 1, justificadas: 2, derecho: 4, repuestas: 1, pendientes: 3, agendadas: 1, porAgendar: 2 });
    expect(l.reposicion.items.map((i) => i.type).sort()).toEqual(['JUSTIFIED', 'JUSTIFIED', 'OTHER', 'RAIN']);
    expect(l.reposicion.repuestasItems).toEqual([{ date: '2026-09-26', label: 'Reposición', units: 1, absent: false }]);
  });
  it('calendario', () => {
    expect(l.calendario).toMatchObject({ festivos: 1, recuperables: 1 });
    expect(l.calendario.items).toEqual([{ date: '2026-10-12', groupCode: 'G1', reason: null }]);
  });
  it('pendientes: 13 + 1 + 2 + 7 = 23', () => {
    expect(l.pendientes).toMatchObject({ total: 23, restantesEnSemestre: 13, cubreCalendario: 13, agendadasAplicadas: 1, porAgendar: 2, deficit: 7, from: '2026-10-15' });
  });
  it('sinConsolidar: la clase del 14 de octubre sin cerrar', () => {
    expect(l.sinConsolidar).toEqual({ clases: 1, conflictos: 0 });
  });
  it('asistencia: 13 presentes, 3 faltas, 81 %', () => {
    expect(l.asistencia).toEqual({ presentes: 13, faltas: 3, justificadas: 2, tasa: 81 });
  });
  it('semáforo ROJO (déficit) y proyección más allá del cierre', () => {
    expect(l.semaforo).toBe('ROJO');
    expect(l.proyeccion.n).toBe(22); // 23 pendientes − 1 agendada
    expect(l.proyeccion.excedeSemestre).toBe(true); // el calendario se acaba el 30 nov
  });
});

describe('buildLedger — Caso B: reposición doble perdida', () => {
  it('una falta a una reposición doble consume 2 y salda la deuda', () => {
    const rain = [sess('r1', '2026-09-02', 'CANCELADA', 'LLUVIA'), sess('r2', '2026-09-09', 'CANCELADA', 'LLUVIA')];
    const regular = ['2026-08-03', '2026-08-05', '2026-08-10', '2026-08-12'].map((d) => sess(`s${d}`, d));
    const makeup = { id: 'm1', date: '2026-09-26', kind: 'MAKEUP', status: 'REALIZADA', groupId: null, session: { effectiveUnits: 2 } };
    const l = buildLedger(base({
      student: { ...base().student, classesAcquired: 10 },
      sessions: [...rain, ...regular],
      records: [...regular.map((s) => rec('PRESENTE', s)), rec('AUSENTE', makeup, { attendanceType: 'REPOSICION' })],
    }));
    expect(l.consumidas.total).toBe(6);
    expect(l.consumidas.reposicionesVistas).toBe(2);
    expect(l.reposicion.repuestas).toBe(2);
    expect(l.reposicion.derecho).toBe(2);
    expect(l.reposicion.pendientes).toBe(0);
    expect(l.reposicion.repuestasItems[0]).toMatchObject({ units: 2, absent: true });
  });
});

describe('buildLedger — Caso C: justificada en reposición por invitación', () => {
  it('no genera derecho (solo cuenta la J en clase regular)', () => {
    const rain = sess('r1', '2026-09-02', 'CANCELADA', 'LLUVIA');
    const other = { id: 'x1', groupId: 'g2', date: '2026-09-10', kind: 'REGULAR', status: 'REALIZADA' };
    const l = buildLedger(base({
      student: { ...base().student, classesAcquired: 10 },
      sessions: [rain],
      records: [rec('JUSTIFICADA', other, { attendanceType: 'REPOSICION' })],
    }));
    expect(l.reposicion.justificadas).toBe(0);
    expect(l.reposicion.derecho).toBe(1);
    expect(l.reposicion.repuestas).toBe(0);
    expect(l.reposicion.pendientes).toBe(1);
    expect(l.noConsumen.justificadas).toBe(1);
  });
});

describe('buildLedger — Caso D: clase después del cierre', () => {
  it('antes del siguiente semestre cuenta; dentro de él no', () => {
    const after = sess('a', '2026-12-07');
    const next = sess('b', '2027-02-03');
    const l = buildLedger(base({ sessions: [after, next], records: [rec('PRESENTE', after), rec('PRESENTE', next)] }));
    expect(l.consumidas.presentes).toBe(1);
    expect(l.asistencia.presentes).toBe(1);
  });
  it('sin semestre posterior (to = null) cuenta todo lo posterior', () => {
    const next = sess('b', '2027-02-03');
    const l = buildLedger(base({ window: { from: '2026-08-01', to: null }, sessions: [next], records: [rec('PRESENTE', next)] }));
    expect(l.consumidas.presentes).toBe(1);
  });
});

describe('buildLedger — Caso E: suspensión', () => {
  it('congela el paquete: ausencia, lluvia y festivo del período no aplican; el presente sí consume', () => {
    const absent = sess('a', '2026-09-08');
    const present = sess('p', '2026-09-10');
    const rain = sess('r', '2026-09-14', 'CANCELADA', 'LLUVIA'); // lunes, suspendida
    const l = buildLedger(base({
      student: { ...base().student, suspendedFrom: '2026-09-07', suspendedUntil: '2026-09-20' },
      sessions: [absent, present, rain],
      records: [rec('AUSENTE', absent), rec('PRESENTE', present)],
      exclusions: ['2026-09-09'], // miércoles, suspendida
    }));
    expect(l.consumidas.ausentes).toBe(0);
    expect(l.reposicion.lluvia).toBe(0);
    expect(l.calendario.festivos).toBe(0);
    expect(l.consumidas.presentes).toBe(1);
    expect(l.asistencia.faltas).toBe(0);
  });
  it('el estado es SUSPENDIDO hoy dentro del rango (inclusivo)', () => {
    const s = { ...base().student, suspendedFrom: '2026-10-10', suspendedUntil: '2026-10-15' };
    expect(buildLedger(base({ student: s })).status).toBe('SUSPENDIDO');
    expect(buildLedger(base({ student: s, today: '2026-10-16' })).status).not.toBe('SUSPENDIDO');
  });
});

describe('buildLedger — Caso F: festival', () => {
  it('la ausencia en festival consume; la justificada no consume ni da derecho', () => {
    const fest = { id: 'f1', groupId: null, date: '2026-09-12', kind: 'FESTIVAL', status: 'REALIZADA' };
    const fest2 = { id: 'f2', groupId: null, date: '2026-09-13', kind: 'FESTIVAL', status: 'REALIZADA' };
    const l = buildLedger(base({ records: [rec('AUSENTE', fest), rec('JUSTIFICADA', fest2)] }));
    expect(l.consumidas.ausentes).toBe(1);
    expect(l.reposicion.justificadas).toBe(0);
    expect(l.noConsumen.justificadas).toBe(1);
  });
});

describe('buildLedger — Caso G: días contratados', () => {
  it('con weekdays [1] (solo lunes) lluvia del miércoles, festivo del viernes y clase sin reporte del miércoles no le aplican', () => {
    const g = (id, date, status, cat) => ({ id, groupId: 'g3', date, kind: 'REGULAR', status, cancellationCategory: cat || null });
    const l = buildLedger(base({
      student: { ...base().student, classesStartDate: null },
      enrollments: [{ groupId: 'g3', enrolledAt: '2026-10-05', weekdays: [1], group: G_LMV }],
      sessions: [
        g('l5', '2026-10-05', 'REALIZADA'), g('l12', '2026-10-12', 'REALIZADA'),
        g('w7', '2026-10-07', 'CANCELADA', 'LLUVIA'), g('w14', '2026-10-14', 'PROGRAMADA'),
      ],
      exclusions: ['2026-10-09'], // viernes
    }));
    expect(l.reposicion.lluvia).toBe(0);
    expect(l.calendario.festivos).toBe(0);
    expect(l.sinConsolidar.clases).toBe(0);
    // lunes 19, 26 oct y 2, 9, 16, 23, 30 nov
    expect(l.pendientes.restantesEnSemestre).toBe(7);
  });
  it('sin weekdays (todos) los mismos eventos sí le aplican', () => {
    const l = buildLedger(base({
      student: { ...base().student, classesStartDate: null },
      enrollments: [{ groupId: 'g3', enrolledAt: '2026-10-05', weekdays: null, group: G_LMV }],
      sessions: [{ id: 'w7', groupId: 'g3', date: '2026-10-07', kind: 'REGULAR', status: 'CANCELADA', cancellationCategory: 'LLUVIA' }],
      exclusions: ['2026-10-09'],
    }));
    expect(l.reposicion.lluvia).toBe(1);
    expect(l.calendario.festivos).toBe(1);
  });
  it('lista vacía equivale a todos los días (así guarda Prisma el "todos")', () => {
    const l = buildLedger(base({
      enrollments: [{ groupId: 'g3', enrolledAt: '2026-10-05', weekdays: [], group: G_LMV }],
      sessions: [{ id: 'w7', groupId: 'g3', date: '2026-10-07', kind: 'REGULAR', status: 'CANCELADA', cancellationCategory: 'LLUVIA' }],
    }));
    expect(l.reposicion.lluvia).toBe(1);
  });
});

describe('buildLedger — Caso H: graduada con excedente', () => {
  const dates = classDates('2026-08-03', '2026-10-05');
  const sessions = dates.slice(0, 11).map((d) => sess(`s${d}`, d));
  const l = buildLedger(base({
    student: { ...base().student, classesAcquired: 10 },
    sessions,
    records: sessions.map((s) => rec('PRESENTE', s)),
  }));
  it('consumidas 11, excedente 1, sin pendientes', () => {
    expect(l.consumidas.total).toBe(11);
    expect(l.consumidas.excedente).toBe(1);
    expect(l.pendientes.total).toBe(0);
  });
  it('GRADUADO con la fecha del décimo presente y semáforo GRIS', () => {
    expect(l.status).toBe('GRADUADO');
    expect(l.graduadoEl).toBe(dates[9]);
    expect(l.semaforo).toBe('GRIS');
  });
  it('el estado de pago se conserva aparte (tuitionStatus)', () => {
    const paid = buildLedger(base({
      student: { ...base().student, classesAcquired: 10 }, sessions,
      records: sessions.map((s) => rec('PRESENTE', s)),
      tuition: { totalPaid: 1000, expectedTotal: 1000 },
    }));
    expect(paid.status).toBe('GRADUADO');
    expect(paid.tuitionStatus).toBe('MATRICULADO');
  });
});

describe('buildLedger — Caso I: sin paquete', () => {
  it('con 0 adquiridas no se gradúa y el semáforo es ROJO', () => {
    const sessions = ['2026-08-03', '2026-08-05', '2026-08-10'].map((d) => sess(`s${d}`, d));
    const l = buildLedger(base({
      student: { ...base().student, classesAcquired: 0 },
      sessions, records: sessions.map((s) => rec('PRESENTE', s)),
    }));
    expect(l.pendientes.total).toBe(0);
    expect(l.status).not.toBe('GRADUADO');
    expect(l.semaforo).toBe('ROJO');
  });
});

describe('buildLedger — Caso J: estado por pago (D7)', () => {
  const sessions = classDates('2026-08-03', '2026-08-12').map((d) => sess(`s${d}`, d));
  const withPaid = (totalPaid, records = []) => buildLedger(base({
    sessions, records, tuition: { totalPaid, expectedTotal: 1_000_000 },
  })).status;
  it('0 → PREINSCRITO · parcial → INSCRITO · completo → MATRICULADO', () => {
    expect(withPaid(0)).toBe('PREINSCRITO');
    expect(withPaid(400_000)).toBe('INSCRITO');
    expect(withPaid(1_000_000)).toBe('MATRICULADO');
    expect(withPaid(1_500_000)).toBe('MATRICULADO');
  });
  it('la asistencia no cambia el estado: con 5 presentes y sin pagos sigue PREINSCRITO', () => {
    const five = classDates('2026-08-03', '2026-09-02').slice(0, 5).map((d) => sess(`p${d}`, d));
    const l = buildLedger(base({
      sessions: five, records: five.map((s) => rec('PRESENTE', s)),
      tuition: { totalPaid: 0, expectedTotal: 1_000_000 },
    }));
    expect(l.consumidas.presentes).toBe(5);
    expect(l.status).toBe('PREINSCRITO');
  });
  it('sin valor esperado (sin fecha de nacimiento) nunca llega a MATRICULADO', () => {
    expect(buildLedger(base({ tuition: { totalPaid: 5_000_000, expectedTotal: null } })).status).toBe('INSCRITO');
  });
  it('INACTIVO, SUSPENDIDO y PRUEBA ganan sobre el pago', () => {
    const t = { totalPaid: 1_000_000, expectedTotal: 1_000_000 };
    expect(buildLedger(base({ student: { ...base().student, active: false }, tuition: t })).status).toBe('INACTIVO');
    expect(buildLedger(base({ student: { ...base().student, isTrial: true }, tuition: t })).status).toBe('PRUEBA');
  });
});

describe('buildLedger — reglas del brief no cubiertas por los casos', () => {
  it('D2: SIN_ESTUDIANTES consume una clase a quien le tocaba, sin registro', () => {
    const l = buildLedger(base({ sessions: [sess('n1', '2026-09-02', 'CANCELADA', 'SIN_ESTUDIANTES')] }));
    expect(l.consumidas.ausentes).toBe(1);
    expect(l.reposicion.derecho).toBe(0); // no genera reposición
  });
  it('D2: si el estudiante tiene registro en esa sesión no se cuenta dos veces', () => {
    const s = sess('n1', '2026-09-02', 'CANCELADA', 'SIN_ESTUDIANTES');
    const l = buildLedger(base({ sessions: [s], records: [rec('AUSENTE', s)] }));
    expect(l.consumidas.ausentes).toBe(1);
  });
  it('D1: OTRA da derecho a reposición y no consume', () => {
    const l = buildLedger(base({ sessions: [sess('o1', '2026-09-02', 'CANCELADA', 'OTRA')] }));
    expect(l.reposicion.otras).toBe(1);
    expect(l.consumidas.total).toBe(0);
  });
  it('una falta anterior a classesStartDate no consume ni cuenta', () => {
    const early = sess('e', '2026-08-01');
    const l = buildLedger(base({ sessions: [early], records: [rec('AUSENTE', early)] }));
    expect(l.consumidas.ausentes).toBe(0);
    expect(l.asistencia.faltas).toBe(0);
  });
  it('un festivo en el que el grupo igual dio clase no se cuenta', () => {
    const l = buildLedger(base({ sessions: [sess('h', '2026-10-12', 'REALIZADA')] }));
    expect(l.calendario.festivos).toBe(0);
  });
  it('un estudiante en dos grupos el mismo día suma un festivo por grupo', () => {
    const G2 = { ...G1, id: 'g2', code: 'G2' };
    const l = buildLedger(base({
      enrollments: [
        { groupId: 'g1', enrolledAt: '2026-08-01', weekdays: null, group: G1 },
        { groupId: 'g2', enrolledAt: '2026-08-01', weekdays: null, group: G2 },
      ],
    }));
    expect(l.calendario.festivos).toBe(2);
  });
  it('el excedente de reposiciones vistas sobre el derecho recupera festivos', () => {
    const m = { id: 'm1', date: '2026-09-26', kind: 'MAKEUP', status: 'REALIZADA', groupId: null, session: { effectiveUnits: 2 } };
    const l = buildLedger(base({ records: [rec('PRESENTE', m, { attendanceType: 'REPOSICION' })] }));
    // derecho 0, repuestas 2 → sobrante 2; festivos 1 → recuperables 0
    expect(l.calendario.festivos).toBe(1);
    expect(l.calendario.recuperables).toBe(0);
  });
  it('clases sin consolidar y conflictos', () => {
    // Todas cerradas hasta el 7 de octubre salvo lun 5 (sin consolidar, con conflicto) y mié 7 (sin sesión)
    const sessions = classDates('2026-08-03', '2026-10-07').filter((d) => d !== '2026-10-07')
      .map((d) => (d === '2026-10-05'
        ? sess('c1', d, 'PROGRAMADA', null, { consolidationStatus: 'MISMATCH' })
        : sess(`s${d}`, d)));
    const l = buildLedger(base({ sessions, today: '2026-10-07' }));
    expect(l.sinConsolidar.clases).toBe(2);
    expect(l.sinConsolidar.conflictos).toBe(1);
  });
  it('semáforo: VERDE al día, AMBAR con una clase sin cerrar, ROJO con 3 o más', () => {
    // Paquete chico: el calendario restante alcanza de sobra (sin déficit)
    const student = { ...base().student, classesAcquired: 10 };
    const closed = classDates('2026-08-03', '2026-10-14').map((d) => sess(`s${d}`, d));
    const at = (sessions) => buildLedger(base({ student, sessions, today: '2026-10-14', semesterEnd: '2026-12-31' }));
    const green = at(closed);
    expect(green.sinConsolidar.clases).toBe(0);
    expect(green.semaforo).toBe('VERDE');
    const amber = at(closed.slice(0, -1));
    expect(amber.sinConsolidar.clases).toBe(1);
    expect(amber.semaforo).toBe('AMBAR');
    const red = at(closed.slice(0, -3));
    expect(red.sinConsolidar.clases).toBe(3);
    expect(red.semaforo).toBe('ROJO');
  });
  it('semáforo AMBAR por reposición por agendar aunque todo esté cerrado', () => {
    const student = { ...base().student, classesAcquired: 10 };
    const closed = classDates('2026-08-03', '2026-10-14').map((d) => sess(`s${d}`, d));
    const rain = sess('r', '2026-08-05', 'CANCELADA', 'LLUVIA');
    const l = buildLedger(base({
      student, sessions: [...closed.filter((s) => s.date !== '2026-08-05'), rain], today: '2026-10-14', semesterEnd: '2026-12-31',
    }));
    expect(l.reposicion.porAgendar).toBe(1);
    expect(l.semaforo).toBe('AMBAR');
  });
  it('con un registro hoy, la proyección arranca mañana', () => {
    const s = sess('t', '2026-10-15');
    expect(buildLedger(base({ sessions: [s], records: [rec('PRESENTE', s)] })).pendientes.from).toBe('2026-10-16');
    expect(buildLedger(base()).pendientes.from).toBe('2026-10-15');
  });
  it('acepta Date además de cadenas', () => {
    const l = buildLedger(base({
      today: new Date('2026-10-15T00:00:00Z'),
      window: { from: new Date('2026-08-01T00:00:00Z'), to: null },
      exclusions: [new Date('2026-10-12T00:00:00Z')],
    }));
    expect(l.calendario.festivos).toBe(1);
  });
});

// ─── Invariante sobre entradas aleatorias ────────────────────────────────

// PRNG determinista (mulberry32): la prueba es reproducible
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInput(seed) {
  const r = rng(seed);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (list) => list[int(0, list.length - 1)];
  const day = (offset) => new Date(Date.UTC(2026, 7, 1) + offset * 86400000).toISOString().slice(0, 10);
  const span = 220; // 1 ago 2026 → ~7 mar 2027

  const mkGroup = (id) => ({
    id, code: id.toUpperCase(), active: r() > 0.1, createdAt: day(-int(0, 40)),
    lunes: r() > 0.5, martes: r() > 0.7, miercoles: r() > 0.5, jueves: r() > 0.7,
    viernes: r() > 0.6, sabado: r() > 0.8, domingo: false,
  });
  const groups = [mkGroup('g1'), mkGroup('g2')].map((g) => (g.lunes || g.miercoles || g.viernes ? g : { ...g, lunes: true }));
  const enrollments = groups.slice(0, int(1, 2)).map((g) => ({
    groupId: g.id, group: g, enrolledAt: day(int(0, 30)),
    weekdays: r() > 0.6 ? [pick([1, 2, 3, 4, 5, 6])] : null,
  }));

  const kinds = ['REGULAR', 'REGULAR', 'REGULAR', 'MAKEUP', 'FESTIVAL'];
  const sessions = [];
  const records = [];
  for (let i = 0; i < int(0, 45); i += 1) {
    const kind = pick(kinds);
    const date = day(int(-5, span));
    const status = pick(['REALIZADA', 'REALIZADA', 'CANCELADA', 'PROGRAMADA']);
    const category = status === 'CANCELADA' ? pick(['LLUVIA', 'OTRA', 'SIN_ESTUDIANTES']) : null;
    const s = {
      id: `s${i}`, groupId: kind === 'REGULAR' ? pick(['g1', 'g2']) : null, date, kind, status,
      cancellationCategory: category, effectiveUnits: pick([1, 1, 1, 2, 0.5, null]),
      consolidationStatus: pick([null, 'MATCHED', 'MISMATCH', 'PENDING']),
    };
    if (kind === 'REGULAR') sessions.push(s);
    if (r() > 0.45) {
      records.push({
        status: pick(['PRESENTE', 'PRESENTE', 'AUSENTE', 'JUSTIFICADA', 'NO_APLICA']),
        attendanceType: kind === 'MAKEUP' || r() > 0.9 ? 'REPOSICION' : 'REGULAR',
        session: s,
      });
    }
  }
  const scheduled = Array.from({ length: int(0, 3) }, (_, i) => ({ sessionId: `m${i}`, date: day(int(60, span)), effectiveUnits: pick([1, 1, 2, 0.5]) }));
  const suspended = r() > 0.8;
  const from = day(int(20, 60));

  return {
    student: {
      id: `st${seed}`, name: `Est ${seed}`, isTrial: r() > 0.95, active: r() > 0.05,
      classesAcquired: int(0, 60), previousClasses: r() > 0.7 ? int(0, 12) : 0,
      classesStartDate: r() > 0.3 ? day(int(0, 40)) : null,
      suspendedFrom: suspended ? from : null, suspendedUntil: suspended ? day(int(61, 90)) : null,
    },
    enrollments, records, sessions, scheduled,
    exclusions: Array.from({ length: int(0, 8) }, () => day(int(0, span))),
    window: { from: day(0), to: r() > 0.5 ? day(span) : null },
    semesterEnd: day(int(90, 120)),
    today: day(int(30, 150)),
    tuition: { totalPaid: pick([0, 0, 400_000, 1_000_000]), expectedTotal: pick([null, 1_000_000]) },
  };
}

describe('buildLedger — invariante sobre 200 entradas aleatorias', () => {
  const STATUSES = ['INACTIVO', 'SUSPENDIDO', 'PRUEBA', 'GRADUADO', 'MATRICULADO', 'INSCRITO', 'PREINSCRITO'];
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);

  for (let seed = 1; seed <= 200; seed += 1) {
    it(`semilla ${seed}`, () => {
      const l = buildLedger(randomInput(seed));
      const p = l.pendientes;

      // Invariante: lo que falta se reparte exactamente entre cuatro cubetas
      expect(round1(p.cubreCalendario + p.agendadasAplicadas + p.porAgendar + p.deficit)).toBe(p.total);
      expect(p.total).toBe(Math.max(0, round1(l.paquete.total - l.consumidas.total)));

      // Ninguna cifra es negativa ni NaN
      for (const n of [p.total, p.cubreCalendario, p.agendadasAplicadas, p.porAgendar, p.deficit, p.restantesEnSemestre,
        l.consumidas.total, l.consumidas.excedente, l.consumidas.presentes, l.consumidas.ausentes, l.consumidas.reposicionesVistas,
        l.reposicion.pendientes, l.reposicion.porAgendar, l.reposicion.agendadas, l.reposicion.derecho,
        l.calendario.festivos, l.calendario.recuperables, l.sinConsolidar.clases, l.sinConsolidar.conflictos, l.proyeccion.n]) {
        expect(finite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }

      // Relaciones entre cifras
      expect(l.consumidas.total).toBe(round1(l.consumidas.presentes + l.consumidas.ausentes + l.consumidas.reposicionesVistas));
      expect(l.reposicion.pendientes).toBeLessThanOrEqual(p.total);
      expect(l.reposicion.porAgendar).toBeLessThanOrEqual(l.reposicion.pendientes);
      expect(p.porAgendar).toBeLessThanOrEqual(l.reposicion.pendientes);
      expect(l.calendario.recuperables).toBeLessThanOrEqual(l.calendario.festivos);
      expect(round1(l.reposicion.pendientes + l.calendario.recuperables)).toBeLessThanOrEqual(p.total);

      // Estado y semáforo coherentes
      expect(STATUSES).toContain(l.status);
      expect(['VERDE', 'AMBAR', 'ROJO', 'GRIS']).toContain(l.semaforo);
      expect(l.semaforo === 'GRIS').toBe(['GRADUADO', 'PRUEBA', 'SUSPENDIDO', 'INACTIVO'].includes(l.status));
      if (l.status === 'GRADUADO') {
        expect(p.total).toBe(0);
        expect(l.paquete.total).toBeGreaterThan(0);
        expect(l.graduadoEl).toBeTruthy();
      } else {
        expect(l.graduadoEl).toBeNull();
      }
      if (l.tuitionStatus !== l.status) expect(l.status).toBe('GRADUADO');
    });
  }
});
