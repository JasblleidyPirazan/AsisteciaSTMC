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

// Clases del plan de un grupo (una matrícula completa). Es un plan de N clases,
// no "todas las que alcancen en el semestre": 40 por defecto.
const DEFAULT_PLAN_CLASSES = 40;
// Horizonte para buscar la clase N de un grupo (≈ 2 años: sobra para 1 día/semana).
const PLAN_HORIZON_DAYS = 800;

async function getPlanClasses() {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'tuition_plan_classes' } });
  const n = parseInt(row?.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PLAN_CLASSES;
}

// Meta de clases de un grupo: los de un solo día por semana tienen la mitad del
// plan (20 de 40); los de 2 o más días, el plan completo.
function planForGroup(group, basePlan) {
  const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
    .filter((d) => group[d]).length;
  return days === 1 ? Math.round(basePlan / 2) : basePlan;
}

// Calendario de UN grupo contra su plan de `plan` clases, contadas desde el
// inicio del semestre.
//   plannedEnd   = la clase N si NINGUNA fecha se excluyera ni se perdiera
//   estimatedEnd = la clase N real: se salta los festivos / fechas excluidas y
//                  recupera lo que no se dictó (lluvia, cancelaciones): faltan
//                  `plan − given` clases por dictar desde hoy
//   lost         = festivos / fechas excluidas que caen en días del grupo
//                  dentro de ese rango (los que ya pasaron y los que vienen)
// `given` = clases dadas a hoy; `givenToday` = la de hoy ya está reportada
// (la proyección arranca mañana); `rain` = canceladas por lluvia a hoy.
function holidayDeviationForGroup(group, semester, exclusions, opts = {}) {
  const { plan: basePlan = DEFAULT_PLAN_CLASSES, given = 0, rain = 0, givenToday = false, todayStr = null } = opts;
  const plan = planForGroup(group, basePlan);
  const startStr = dbDateStr(semester.startDate);
  const horizon = addDays(startStr, PLAN_HORIZON_DAYS);
  const ideal = scheduledDatesBetween(group, [], startStr, horizon);
  const plannedEnd = ideal[plan - 1] || null;

  const remaining = Math.max(0, plan - given);
  let estimatedEnd = null;
  if (remaining === 0) {
    // Plan completo: terminó en su última clase dada (no hay nada que estimar)
    estimatedEnd = todayStr;
  } else {
    let from = todayStr || startStr;
    if (givenToday) from = addDays(from, 1);
    if (from < startStr) from = startStr;
    const future = scheduledDatesBetween(group, exclusions, from, addDays(from, PLAN_HORIZON_DAYS));
    estimatedEnd = future[remaining - 1] || null;
  }

  const excluded = new Set(exclusions.map((e) => dbDateStr(e.date)));
  const reasonByDate = Object.fromEntries(exclusions.map((e) => [dbDateStr(e.date), e.reason || null]));
  const limit = estimatedEnd || plannedEnd || horizon;
  const lostDates = ideal
    .filter((d) => excluded.has(d) && d <= limit)
    .map((d) => ({ date: d, reason: reasonByDate[d] }));

  return {
    groupId: group.id,
    code: group.code,
    days: daysLabel(group),
    plan,
    given,
    remaining,
    lost: lostDates.length,
    rain,
    totalLost: lostDates.length + rain,
    lostDates,
    plannedStart: ideal[0] || null,
    plannedEnd,
    estimatedEnd,
    delayDays: remaining > 0 && estimatedEnd && plannedEnd
      ? Math.round((new Date(`${estimatedEnd}T00:00:00Z`) - new Date(`${plannedEnd}T00:00:00Z`)) / 86400000)
      : null,
  };
}

// Clases dadas / canceladas por lluvia de cada grupo hasta hoy, y si la clase
// de hoy ya quedó reportada (para arrancar la proyección mañana).
async function loadGroupSessionCounts(groups, semester, todayStr) {
  const given = {};
  const rain = {};
  const givenToday = {};
  if (groups.length === 0) return { given, rain, givenToday };
  const sessions = await prisma.classSession.findMany({
    where: {
      kind: 'REGULAR',
      groupId: { in: groups.map((g) => g.id) },
      date: { gte: new Date(semester.startDate), lte: new Date(semester.endDate) },
    },
    select: { groupId: true, date: true, status: true, cancellationCategory: true },
  });
  for (const x of sessions) {
    const d = dbDateStr(x.date);
    if (d > todayStr) continue;
    if (x.status === 'REALIZADA') {
      given[x.groupId] = (given[x.groupId] || 0) + 1;
      if (d === todayStr) givenToday[x.groupId] = true;
    } else if (x.status === 'CANCELADA' && x.cancellationCategory === 'LLUVIA') {
      rain[x.groupId] = (rain[x.groupId] || 0) + 1;
      if (d === todayStr) givenToday[x.groupId] = true; // hoy ya se resolvió
    }
  }
  return { given, rain, givenToday };
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
  const hasClassesLeft = (s) => {
    const c = computeCompletion({ acquired: s.classesAcquired, previous: s.previousClasses, seen: seenById[s.id] || 0 });
    return c.total > 0 && !c.completed;
  };
  const leftIds = students.filter(hasClassesLeft).map((s) => s.id);
  if (leftIds.length > 0) {
    const todayRecords = await prisma.attendanceRecord.findMany({
      where: { studentId: { in: leftIds }, session: { date: today } },
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
    const end = c.total > 0 && !c.completed
      ? projectEndDate(groups, semester, semester.exclusions, c.remaining, reportedToday.has(s.id) ? tomorrow : today)
      : { date: null, beyondSemester: false };
    return {
      studentId: s.id,
      name: s.name,
      groups: groups.map((g) => g.code),
      total: c.total,
      seen,
      pct: c.total > 0 ? Math.min(100, Math.round((seen / c.total) * 100)) : null,
      remaining: c.remaining,
      completed: c.completed,
      nearEnd,
      projectedEnd: end.date,
      endsBeyondSemester: end.beyondSemester,
    };
  });
  return { semester, rows };
}

// Calendario de cada grupo activo contra su plan de 40 clases, con lo perdido
// por festivos y por lluvia y la fecha final estimada. El más afectado primero.
async function computeGroupHolidayDeviation() {
  const semester = await prisma.semester.findFirst({
    where: { active: true },
    include: { exclusions: true },
  });
  if (!semester) return { semester: null, groups: [] };
  const todayStr = dbDateStr(bogotaToday());
  const [groups, plan] = await Promise.all([
    prisma.group.findMany({
      where: { active: true },
      include: { professor: { select: { id: true, name: true } } },
    }),
    getPlanClasses(),
  ]);
  const counts = await loadGroupSessionCounts(groups, semester, todayStr);

  const rows = groups.map((g) => ({
    ...holidayDeviationForGroup(g, semester, semester.exclusions, {
      plan, todayStr,
      given: counts.given[g.id] || 0, rain: counts.rain[g.id] || 0, givenToday: !!counts.givenToday[g.id],
    }),
    professor: g.professor,
  }));
  const minLost = rows.length ? Math.min(...rows.map((r) => r.totalLost)) : 0;
  const data = rows
    .map((r) => ({ ...r, extraVsBest: r.totalLost - minLost }))
    .sort((a, b) => b.totalLost - a.totalLost || a.code.localeCompare(b.code, 'es', { numeric: true }));
  return {
    semester: { id: semester.id, name: semester.name, startDate: semester.startDate, endDate: semester.endDate },
    today: todayStr,
    plan,
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
 *           + clases que cayeron en FESTIVOS / fechas excluidas (ya pasadas)
 *   repuso = clases vistas en reposiciones (sesión MAKEUP o registro REPOSICION)
 *   por reponer = debe − repuso, con tope en lo que le queda del paquete
 *
 * NO cuentan: la ausencia sin justificar (la perdió) ni las clases aún sin
 * reportar. Los festivos se suman pero se informan aparte (`holidays`) para
 * mostrarse en otro color.
 */
async function computeMakeupDebt({ studentIds = null } = {}) {
  const semester = await prisma.semester.findFirst({
    where: { active: true },
    include: { exclusions: true },
  });
  if (!semester) return { semester: null, rows: [] };

  const today = bogotaToday();
  const students = await prisma.student.findMany({
    where: {
      active: true, isTrial: false, ...notSuspended(today),
      // Agendamiento público: la deuda de un solo estudiante
      ...(studentIds ? { id: { in: studentIds } } : {}),
    },
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

  const todayStr = dbDateStr(today);
  const exclusionDates = semester.exclusions.map((e) => dbDateStr(e.date)).filter((d) => d <= todayStr);

  const rows = students.map((s) => {
    let rain = 0;
    let holidays = 0;
    for (const e of s.enrollments) {
      if (!e.group?.active) continue;
      const floor = new Date(Math.max(
        new Date(e.enrolledAt), new Date(e.group.createdAt),
        ...(s.classesStartDate ? [new Date(s.classesStartDate)] : [])
      ));
      const floorStr = dbDateStr(floor);
      rain += (rainByGroup[e.groupId] || []).filter((d) => d >= floorStr).length;
      // Festivos / fechas excluidas ya pasadas que caían en un día de su grupo
      holidays += exclusionDates.filter((d) => d >= floorStr && e.group[DAY_FIELDS[new Date(`${d}T00:00:00Z`).getUTCDay()]]).length;
    }
    const justifiedCount = justifiedByStudent[s.id] || 0;
    const madeUp = roundUnits(madeUpById[s.id] || 0);
    const c = computeCompletion({
      acquired: s.classesAcquired, previous: s.previousClasses, seen: seenById[s.id] || 0,
    });
    const owed = rain + justifiedCount + holidays;
    // Sin paquete registrado no hay contra qué topar: no se reporta deuda
    const pending = c.total > 0 ? Math.min(Math.max(0, roundUnits(owed - madeUp)), c.remaining) : 0;
    return {
      studentId: s.id,
      name: s.name,
      groups: s.enrollments.map((e) => e.group).filter((g) => g?.active).map((g) => g.code),
      rain, justified: justifiedCount, holidays, madeUp, pending,
    };
  });
  return { semester, rows };
}

/**
 * Avance de cada grupo activo en el semestre (Reportes → Avance de grupos):
 * fecha de inicio del plan, fecha final estimada, clases dadas, clases no dadas
 * por festivos / recesos y por lluvia, y el avance de cada uno de sus
 * estudiantes (clases vistas / paquete, por reponer, fecha estimada de fin).
 */
async function computeGroupsProgress() {
  const semester = await prisma.semester.findFirst({
    where: { active: true },
    include: { exclusions: true },
  });
  if (!semester) return { semester: null, groups: [] };
  const todayStr = dbDateStr(bogotaToday());

  const [groups, plan] = await Promise.all([
    prisma.group.findMany({
      where: { active: true },
      include: { professor: { select: { id: true, name: true } } },
    }),
    getPlanClasses(),
  ]);
  const counts = await loadGroupSessionCounts(groups, semester, todayStr);

  const [{ rows: progress }, { rows: debt }] = await Promise.all([computeStudentProgress(), computeMakeupDebt()]);
  const debtById = Object.fromEntries(debt.map((d) => [d.studentId, d]));
  const studentsByCode = {};
  for (const p of progress) {
    const d = debtById[p.studentId] || {};
    for (const code of p.groups) {
      (studentsByCode[code] ||= []).push({
        studentId: p.studentId, name: p.name, seen: p.seen, total: p.total, pct: p.pct,
        remaining: p.remaining, completed: p.completed,
        pending: d.pending || 0, rain: d.rain || 0, justified: d.justified || 0, holidays: d.holidays || 0,
        projectedEnd: p.projectedEnd, endsBeyondSemester: p.endsBeyondSemester,
      });
    }
  }

  const rows = groups.map((g) => {
    const cal = holidayDeviationForGroup(g, semester, semester.exclusions, {
      plan, todayStr,
      given: counts.given[g.id] || 0, rain: counts.rain[g.id] || 0, givenToday: !!counts.givenToday[g.id],
    });
    const students = (studentsByCode[g.code] || []).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return {
      groupId: g.id,
      code: g.code,
      ballLevel: g.ballLevel,
      subLevel: g.subLevel,
      days: cal.days,
      professor: g.professor,
      startDate: cal.plannedStart,
      estimatedEnd: cal.estimatedEnd,
      plannedEnd: cal.plannedEnd,
      delayDays: cal.delayDays,
      plan: cal.plan,
      given: cal.given,
      upcoming: cal.remaining,
      holidaysLost: cal.lost,
      holidaysLostPast: cal.lostDates.filter((d) => d.date <= todayStr).length,
      holidayDates: cal.lostDates,
      rain: cal.rain,
      pct: cal.plan > 0 ? Math.round((cal.given / cal.plan) * 100) : null,
      // Dónde poner el esfuerzo: reposiciones pendientes de sus estudiantes
      makeupClasses: roundUnits(students.reduce((acc, st) => acc + st.pending, 0)),
      studentsWithMakeups: students.filter((st) => st.pending > 0).length,
      studentsCount: students.length,
      students,
    };
  }).sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));

  return {
    semester: { id: semester.id, name: semester.name, startDate: semester.startDate, endDate: semester.endDate },
    today: todayStr,
    plan,
    groups: rows,
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
  computeMakeupDebt,
  computeGroupsProgress,
  DAY_FIELDS,
};
