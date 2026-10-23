// Avance del semestre por estudiante y desvío por festivos por grupo.
//
// "Semestre completado": el estudiante ya vio TODAS las clases de su paquete
// (adquiridas + pendientes del semestre anterior). Desde ese momento sale de
// los rosters del flujo de asistencia y se muestra como "Semestre completado".
//
// Todo se deriva de datos existentes (sin migración): clases vistas con la
// regla canónica de attendanceStats, y el calendario del semestre activo.
const prisma = require('../lib/prisma');
const { expectedDatesForGroup, DAY_FIELDS } = require('./schedule');
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

// Fecha estimada de la última clase del paquete: se recorren las clases
// programadas de TODOS sus grupos (festivos y fechas excluidas ya fuera) desde
// `from` y se toma la n-ésima, con n = clases que le faltan. Devuelve
// { date, beyondSemester }: si el calendario no alcanza para cubrir lo que le
// falta, date es null y beyondSemester true (no termina dentro del semestre).
function projectEndDate(groups, semester, exclusions, remaining, from) {
  const needed = Math.ceil(remaining);
  if (!semester || needed <= 0) return { date: null, beyondSemester: false };
  const dates = [];
  for (const g of groups) {
    dates.push(...expectedDatesForGroup(g, semester, exclusions, semester.endDate, from));
  }
  dates.sort();
  if (dates.length < needed) return { date: null, beyondSemester: true };
  return { date: dates[needed - 1], beyondSemester: false };
}

const DAY_SHORT = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom' };
function daysLabel(group) {
  return ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
    .filter((d) => group[d]).map((d) => DAY_SHORT[d]).join('-');
}

// Desvío por festivos de UN grupo: clases que el calendario le quita porque su
// día cae en una fecha excluida del semestre. `floor` (creación del grupo)
// evita contarle fechas anteriores a que existiera.
function holidayDeviationForGroup(group, semester, exclusions) {
  const floor = group.createdAt || null;
  const all = expectedDatesForGroup(group, semester, [], semester.endDate, floor);
  const real = expectedDatesForGroup(group, semester, exclusions, semester.endDate, floor);
  const kept = new Set(real);
  const reasonByDate = Object.fromEntries(exclusions.map((e) => [dbDateStr(e.date), e.reason || null]));
  const lostDates = all.filter((d) => !kept.has(d)).map((d) => ({ date: d, reason: reasonByDate[d] }));
  return {
    groupId: group.id,
    code: group.code,
    days: daysLabel(group),
    withoutHolidays: all.length,
    scheduled: real.length,
    lost: lostDates.length,
    lostDates,
    lastClassDate: real.length ? real[real.length - 1] : null,
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

// Desvío por festivos de cada grupo activo, el más afectado primero.
async function computeGroupHolidayDeviation() {
  const semester = await prisma.semester.findFirst({
    where: { active: true },
    include: { exclusions: true },
  });
  if (!semester) return { semester: null, groups: [] };
  const groups = await prisma.group.findMany({
    where: { active: true },
    include: { professor: { select: { id: true, name: true } } },
  });
  const rows = groups.map((g) => ({
    ...holidayDeviationForGroup(g, semester, semester.exclusions),
    professor: g.professor,
  }));
  const minLost = rows.length ? Math.min(...rows.map((r) => r.lost)) : 0;
  const data = rows
    .map((r) => ({ ...r, extraVsBest: r.lost - minLost }))
    .sort((a, b) => b.lost - a.lost || a.code.localeCompare(b.code, 'es', { numeric: true }));
  return {
    semester: { id: semester.id, name: semester.name, startDate: semester.startDate, endDate: semester.endDate },
    exclusions: semester.exclusions
      .map((e) => ({ date: dbDateStr(e.date), reason: e.reason }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    groups: data,
  };
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
  DAY_FIELDS,
};
