// Avance del semestre por estudiante y desvío por festivos por grupo.
//
// "Semestre completado": el estudiante ya vio TODAS las clases de su paquete
// (adquiridas + pendientes del semestre anterior). Desde ese momento sale de
// los rosters del flujo de asistencia y se muestra como "Semestre completado".
//
// Todo se deriva de datos existentes (sin migración): clases vistas con la
// regla canónica de attendanceStats, y el calendario del semestre activo.
const prisma = require('../lib/prisma');
const { expectedDatesForGroup, scheduledDatesBetween, DAY_FIELDS } = require('./schedule');
const {
  seenAttendanceFilter, absenceCounts, attendanceUnits, roundUnits,
} = require('./attendanceStats');
const { notSuspended } = require('../lib/filters');
const { bogotaToday, dbDateStr } = require('../lib/dates');

// Avisos al coordinador: a 3 clases (o más) de reponer / de cerrar el semestre.
const MAKEUP_ALERT_THRESHOLD = 3;
const SEMESTER_END_THRESHOLD = 3;

// ─── Lógica pura ──────────────────────────────────────────────────────────

// total = clases del paquete (adquiridas + pendientes del semestre pasado).
// Sin paquete (total 0) no hay nada que "completar".
function computeCompletion({ acquired = 0, previous = 0, seen = 0 } = {}) {
  const total = (Number(acquired) || 0) + (Number(previous) || 0);
  const remaining = Math.max(0, roundUnits(total - seen));
  return { total, remaining, completed: total > 0 && seen >= total };
}

// Días máximos que se camina hacia adelante buscando la fecha final estimada.
const PROJECTION_MAX_DAYS = 400;

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Fecha estimada de la última clase del paquete: se recorren las clases
// programadas de TODOS sus grupos desde `from` y se toma la n-ésima, con
// n = clases que le faltan. Los festivos y fechas excluidas se saltan (por eso
// corren la fecha final), y el cálculo SIGUE más allá del fin del semestre si
// hace falta: `beyondSemester` avisa que termina después de esa fecha.
// date es null solo si no tiene grupos o no alcanza en ~13 meses.
function projectEndDate(groups, semester, exclusions, remaining, from) {
  const needed = Math.ceil(remaining);
  if (!semester || needed <= 0) return { date: null, beyondSemester: false };
  const fromStr = dbDateStr(from);
  const untilStr = addDays(fromStr, PROJECTION_MAX_DAYS);
  const dates = [];
  for (const g of groups) dates.push(...scheduledDatesBetween(g, exclusions, fromStr, untilStr));
  dates.sort();
  if (dates.length < needed) return { date: null, beyondSemester: true };
  const date = dates[needed - 1];
  return { date, beyondSemester: date > dbDateStr(semester.endDate) };
}

const DAY_SHORT = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom' };
function daysLabel(group) {
  return ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
    .filter((d) => group[d]).map((d) => DAY_SHORT[d]).join('-');
}

// Calendario de UN grupo contra el ideal: si todas sus clases se dictaran desde
// el inicio del semestre hasta su fin. Resta lo que se pierde por festivos /
// fechas excluidas (`lost`) y por lluvia (`rain`, clases ya canceladas), y
// estima la fecha final si esas clases se recuperan siguiendo el horario del
// grupo después de su última clase del semestre.
function holidayDeviationForGroup(group, semester, exclusions, rain = 0) {
  const all = expectedDatesForGroup(group, semester, [], semester.endDate);
  const real = expectedDatesForGroup(group, semester, exclusions, semester.endDate);
  const kept = new Set(real);
  const reasonByDate = Object.fromEntries(exclusions.map((e) => [dbDateStr(e.date), e.reason || null]));
  const lostDates = all.filter((d) => !kept.has(d)).map((d) => ({ date: d, reason: reasonByDate[d] }));
  const plannedEnd = all.length ? all[all.length - 1] : null;
  const lastReal = real.length ? real[real.length - 1] : null;

  // Para dictar las clases del plan hay que reponer festivos + lluvia: se
  // cuentan esas fechas más allá de la última clase del semestre.
  const toRecover = lostDates.length + rain;
  let estimatedEnd = lastReal;
  if (toRecover > 0 && lastReal) {
    const after = scheduledDatesBetween(group, exclusions, addDays(lastReal, 1), addDays(lastReal, PROJECTION_MAX_DAYS));
    estimatedEnd = after[toRecover - 1] || null;
  }
  return {
    groupId: group.id,
    code: group.code,
    days: daysLabel(group),
    withoutHolidays: all.length,
    scheduled: real.length,
    lost: lostDates.length,
    rain,
    totalLost: lostDates.length + rain,
    lostDates,
    plannedEnd,
    estimatedEnd,
    lastClassDate: lastReal,
  };
}

// ─── Consultas ────────────────────────────────────────────────────────────

// Clases vistas por estudiante (unidades) dentro del semestre dado — o
// históricas si no hay semestre. `before` (Date) limita a sesiones ANTERIORES a
// esa fecha: sirve para editar el reporte de la clase en que el estudiante
// justo terminó su paquete sin que desaparezca de su propio roster.
async function loadSeenById(students, semester, { before } = {}) {
  const seenById = {};
  if (students.length === 0) return seenById;
  const dateFilter = {};
  if (semester) {
    dateFilter.gte = semester.startDate;
    dateFilter.lte = semester.endDate;
  }
  if (before) dateFilter.lt = before;
  const hasFilter = Object.keys(dateFilter).length > 0;
  const records = await prisma.attendanceRecord.findMany({
    where: {
      studentId: { in: students.map((s) => s.id) },
      AND: [
        seenAttendanceFilter(),
        ...(hasFilter ? [{ session: { date: dateFilter } }] : []),
      ],
    },
    select: {
      studentId: true, status: true,
      session: { select: { date: true, effectiveUnits: true } },
    },
  });
  const startById = Object.fromEntries(students.map((s) => [s.id, s.classesStartDate]));
  for (const r of records) {
    // AUSENTE de festival anterior al inicio de clases: no consume paquete
    if (r.status === 'AUSENTE' && !absenceCounts(r.session?.date, startById[r.studentId])) continue;
    seenById[r.studentId] = (seenById[r.studentId] || 0) + attendanceUnits(r.session);
  }
  for (const id of Object.keys(seenById)) seenById[id] = roundUnits(seenById[id]);
  return seenById;
}

/**
 * Avance de todos los estudiantes activos (no de prueba) en el semestre activo.
 * [] si no hay semestre. Cada fila: total, seen, remaining, completed y, para
 * quienes están por terminar, la fecha estimada de su última clase.
 */
async function computeStudentProgress() {
  const semester = await prisma.semester.findFirst({
    where: { active: true },
    include: { exclusions: true },
  });
  if (!semester) return { semester: null, rows: [] };

  const today = bogotaToday();
  const students = await prisma.student.findMany({
    where: { active: true, isTrial: false, ...notSuspended(today) },
    include: { enrollments: { include: { group: true } } },
    orderBy: { name: 'asc' },
  });
  const seenById = await loadSeenById(students, semester);

  // ¿Ya tiene registro hoy? Entonces la clase de hoy ya está contada en
  // `seen` y la proyección arranca mañana.
  const reportedToday = new Set();
  const nearEndIds = students
    .filter((s) => {
      const c = computeCompletion({ acquired: s.classesAcquired, previous: s.previousClasses, seen: seenById[s.id] || 0 });
      return c.total > 0 && !c.completed && c.remaining <= SEMESTER_END_THRESHOLD;
    })
    .map((s) => s.id);
  if (nearEndIds.length > 0) {
    const todayRecords = await prisma.attendanceRecord.findMany({
      where: { studentId: { in: nearEndIds }, session: { date: today } },
      select: { studentId: true },
    });
    for (const r of todayRecords) reportedToday.add(r.studentId);
  }
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const rows = students.map((s) => {
    const seen = seenById[s.id] || 0;
    const c = computeCompletion({ acquired: s.classesAcquired, previous: s.previousClasses, seen });
    const groups = s.enrollments.map((e) => e.group).filter((g) => g?.active);
    const nearEnd = c.total > 0 && !c.completed && c.remaining <= SEMESTER_END_THRESHOLD;
    const end = nearEnd
      ? projectEndDate(groups, semester, semester.exclusions, c.remaining, reportedToday.has(s.id) ? tomorrow : today)
      : { date: null, beyondSemester: false };
    return {
      studentId: s.id,
      name: s.name,
      groups: groups.map((g) => g.code),
      total: c.total,
      seen,
      remaining: c.remaining,
      completed: c.completed,
      nearEnd,
      projectedEnd: end.date,
      endsBeyondSemester: end.beyondSemester,
    };
  });
  return { semester, rows };
}

// Calendario de cada grupo activo contra el ideal (inicio → fin del semestre),
// con lo perdido por festivos y por lluvia y la fecha final estimada. El más
// afectado primero.
async function computeGroupHolidayDeviation() {
  const semester = await prisma.semester.findFirst({
    where: { active: true },
    include: { exclusions: true },
  });
  if (!semester) return { semester: null, groups: [] };
  const today = bogotaToday();
  const [groups, rainSessions] = await Promise.all([
    prisma.group.findMany({
      where: { active: true },
      include: { professor: { select: { id: true, name: true } } },
    }),
    prisma.classSession.findMany({
      where: {
        kind: 'REGULAR',
        status: 'CANCELADA',
        cancellationCategory: 'LLUVIA',
        groupId: { not: null },
        date: { gte: new Date(semester.startDate), lte: new Date(semester.endDate) },
      },
      select: { groupId: true },
    }),
  ]);
  const rainByGroup = {};
  for (const s of rainSessions) rainByGroup[s.groupId] = (rainByGroup[s.groupId] || 0) + 1;

  const rows = groups.map((g) => ({
    ...holidayDeviationForGroup(g, semester, semester.exclusions, rainByGroup[g.id] || 0),
    professor: g.professor,
  }));
  const minLost = rows.length ? Math.min(...rows.map((r) => r.totalLost)) : 0;
  const data = rows
    .map((r) => ({ ...r, extraVsBest: r.totalLost - minLost }))
    .sort((a, b) => b.totalLost - a.totalLost || a.code.localeCompare(b.code, 'es', { numeric: true }));
  return {
    semester: { id: semester.id, name: semester.name, startDate: semester.startDate, endDate: semester.endDate },
    today: dbDateStr(today),
    exclusions: semester.exclusions
      .map((e) => ({ date: dbDateStr(e.date), reason: e.reason }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    groups: data,
  };
}

/**
 * Clases por reponer de cada estudiante activo (no de prueba), contadas desde
 * SU ingreso (el último entre inscripción, creación del grupo y fecha de inicio
 * de clases):
 *
 *   debe  = clases de sus grupos canceladas por LLUVIA + clases JUSTIFICADAS
 *   repuso = clases vistas en reposiciones (sesión MAKEUP o registro REPOSICION)
 *   por reponer = debe − repuso, con tope en lo que le queda del paquete
 *
 * NO cuentan: la ausencia sin justificar (la perdió), las clases aún sin
 * reportar, ni los festivos / fechas excluidas (estos no restan nada al
 * estudiante: solo corren la fecha estimada en que termina su paquete).
 */
async function computeMakeupDebt() {
  const semester = await prisma.semester.findFirst({
    where: { active: true },
    include: { exclusions: true },
  });
  if (!semester) return { semester: null, rows: [] };

  const today = bogotaToday();
  const students = await prisma.student.findMany({
    where: { active: true, isTrial: false, ...notSuspended(today) },
    include: { enrollments: { include: { group: true } } },
    orderBy: { name: 'asc' },
  });
  if (students.length === 0) return { semester, rows: [] };

  const ids = students.map((s) => s.id);
  const groupIds = [...new Set(students.flatMap((s) => s.enrollments.map((e) => e.groupId)))];
  const range = { gte: new Date(semester.startDate), lte: new Date(semester.endDate) };
  const upToToday = { gte: new Date(semester.startDate), lte: today < new Date(semester.endDate) ? today : new Date(semester.endDate) };

  const [seenById, rainSessions, justified, makeupSeen] = await Promise.all([
    loadSeenById(students, semester),
    prisma.classSession.findMany({
      where: {
        kind: 'REGULAR', status: 'CANCELADA', cancellationCategory: 'LLUVIA',
        groupId: { in: groupIds }, date: upToToday,
      },
      select: { groupId: true, date: true },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        studentId: { in: ids }, status: 'JUSTIFICADA',
        session: { kind: 'REGULAR', date: range },
      },
      select: { studentId: true, session: { select: { date: true } } },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        studentId: { in: ids },
        AND: [
          seenAttendanceFilter(),
          { OR: [{ attendanceType: 'REPOSICION' }, { session: { kind: 'MAKEUP' } }] },
          { session: { date: range } },
        ],
      },
      select: { studentId: true, session: { select: { effectiveUnits: true } } },
    }),
  ]);

  const rainByGroup = {};
  for (const r of rainSessions) (rainByGroup[r.groupId] ||= []).push(dbDateStr(r.date));
  const justifiedByStudent = {};
  const startById = Object.fromEntries(students.map((s) => [s.id, s.classesStartDate]));
  for (const r of justified) {
    // Antes de que el estudiante empezara clases no es una falta real
    if (!absenceCounts(r.session?.date, startById[r.studentId])) continue;
    justifiedByStudent[r.studentId] = (justifiedByStudent[r.studentId] || 0) + 1;
  }
  const madeUpById = {};
  for (const r of makeupSeen) madeUpById[r.studentId] = (madeUpById[r.studentId] || 0) + attendanceUnits(r.session);

  const rows = students.map((s) => {
    let rain = 0;
    for (const e of s.enrollments) {
      if (!e.group?.active) continue;
      const floor = new Date(Math.max(
        new Date(e.enrolledAt), new Date(e.group.createdAt),
        ...(s.classesStartDate ? [new Date(s.classesStartDate)] : [])
      ));
      const floorStr = dbDateStr(floor);
      rain += (rainByGroup[e.groupId] || []).filter((d) => d >= floorStr).length;
    }
    const justifiedCount = justifiedByStudent[s.id] || 0;
    const madeUp = roundUnits(madeUpById[s.id] || 0);
    const c = computeCompletion({
      acquired: s.classesAcquired, previous: s.previousClasses, seen: seenById[s.id] || 0,
    });
    const owed = rain + justifiedCount;
    // Sin paquete registrado no hay contra qué topar: no se reporta deuda
    const pending = c.total > 0 ? Math.min(Math.max(0, roundUnits(owed - madeUp)), c.remaining) : 0;
    return {
      studentId: s.id,
      name: s.name,
      groups: s.enrollments.map((e) => e.group).filter((g) => g?.active).map((g) => g.code),
      rain, justified: justifiedCount, madeUp, pending,
    };
  });
  return { semester, rows };
}

module.exports = {
  MAKEUP_ALERT_THRESHOLD,
  SEMESTER_END_THRESHOLD,
  computeCompletion,
  projectEndDate,
  holidayDeviationForGroup,
  loadSeenById,
  computeStudentProgress,
  computeGroupHolidayDeviation,
  computeMakeupDebt,
  DAY_FIELDS,
};
