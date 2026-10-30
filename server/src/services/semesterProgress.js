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
  seenAttendanceFilter, absenceCounts, attendanceUnits, consumedUnits, roundUnits,
} = require('./attendanceStats');
const { notSuspended } = require('../lib/filters');
const { bogotaToday, dbDateStr } = require('../lib/dates');

// Avisos al coordinador: a 3 clases (o más) de reponer / de cerrar el semestre.
const MAKEUP_ALERT_THRESHOLD = 3;
const SEMESTER_END_THRESHOLD = 3;

// ─── Lógica pura ──────────────────────────────────────────────────────────

// total = clases del paquete (adquiridas + pendientes del semestre pasado).
// `consumed` = clases CONSUMIDAS del paquete (ver consumptionFromRecords): lo
// que le queda y si ya completó (GRADUADO) salen de ahí, no solo de lo visto.
// Sin paquete (total 0) no hay nada que "completar".
function computeCompletion({ acquired = 0, previous = 0, consumed = 0 } = {}) {
  const total = (Number(acquired) || 0) + (Number(previous) || 0);
  const remaining = Math.max(0, roundUnits(total - consumed));
  return { total, remaining, completed: total > 0 && consumed >= total };
}

// Consumo del paquete de UN estudiante a partir de sus registros PRESENTE /
// AUSENTE (con session.date, kind, effectiveUnits):
//   seen      = clases vistas (regla canónica de attendanceStats): PRESENTE, o
//               AUSENTE en festival
//   consumed  = vistas + faltas sin justificar: la falta consume la clase (el
//               estudiante la pagó y no vino: se perdió, no se repone)
// Las faltas solo cuentan desde su fecha de inicio de clases; JUSTIFICADA y
// N/A no consumen. Todo con unidades (una reposición doble vale 2).
// `completedOn` = fecha de la clase con la que llegó a su paquete (`total`).
function consumptionFromRecords(records, { classesStartDate = null, total = 0 } = {}) {
  let seen = 0;
  let consumed = 0;
  let completedOn = null;
  const sorted = [...records].sort((a, b) => new Date(a.session?.date) - new Date(b.session?.date));
  for (const r of sorted) {
    const units = consumedUnits(r, r.session, classesStartDate);
    if (units === 0) continue;
    if (r.status === 'PRESENTE' || r.session?.kind === 'FESTIVAL') seen += units;
    consumed += units;
    if (!completedOn && total > 0 && consumed >= total) completedOn = dbDateStr(r.session.date);
  }
  return { seen: roundUnits(seen), consumed: roundUnits(consumed), completedOn };
}

// Días de la semana de un grupo que NO le tocan al estudiante: aquellos donde
// su historial solo tiene N/A (compró menos clases que los días del grupo).
// Lluvia y festivos de esos días no le generan reposición. Devuelve un Set de
// "groupId:díaSemana". Un día con N/A y también P/A/J sí le toca (se mezcla).
function notMyDays(records) {
  const na = new Set();
  const mine = new Set();
  for (const r of records) {
    const g = r.session?.groupId;
    if (!g || !r.session?.date) continue;
    const key = `${g}:${new Date(`${dbDateStr(r.session.date)}T00:00:00Z`).getUTCDay()}`;
    (r.status === 'NO_APLICA' ? na : mine).add(key);
  }
  return new Set([...na].filter((k) => !mine.has(k)));
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
// `skip` (de notMyDays) descarta los días del grupo que no le tocan (N/A).
function studentDatesBetween(groups, exclusions, fromStr, untilStr, skip = new Set()) {
  const dates = [];
  for (const g of groups) {
    for (const d of scheduledDatesBetween(g, exclusions, fromStr, untilStr)) {
      if (!skip.has(`${g.id}:${new Date(`${d}T00:00:00Z`).getUTCDay()}`)) dates.push(d);
    }
  }
  return dates.sort();
}

function projectEndDate(groups, semester, exclusions, remaining, from, skip = new Set()) {
  const needed = Math.ceil(remaining);
  if (!semester || needed <= 0) return { date: null, beyondSemester: false };
  const fromStr = dbDateStr(from);
  const untilStr = addDays(fromStr, PROJECTION_MAX_DAYS);
  const dates = studentDatesBetween(groups, exclusions, fromStr, untilStr, skip);
  if (dates.length < needed) return { date: null, beyondSemester: true };
  const date = dates[needed - 1];
  return { date, beyondSemester: date > dbDateStr(semester.endDate) };
}

// Clases regulares que el estudiante todavía puede ver en SUS días desde
// `from` hasta el cierre del semestre (sin festivos / recesos ni días N/A).
function classesLeftInSemester(groups, semester, exclusions, from, skip = new Set()) {
  if (!semester) return 0;
  const fromStr = dbDateStr(from);
  const endStr = dbDateStr(semester.endDate);
  if (fromStr > endStr) return 0;
  return studentDatesBetween(groups, exclusions, fromStr, endStr, skip).length;
}

// Separa lo que le falta al estudiante en dos conceptos:
//   pending  = CLASES DE REPOSICIÓN: lluvia + justificadas − reposiciones vistas.
//              La Escuela debe programarlas (agenda de reposiciones).
//   calendar = CLASES POR RECUPERAR POR CALENDARIO: festivos y recesos que
//              cayeron en sus días. No se reponen: el calendario regular se
//              corre y las devuelve, siempre que alcance antes del cierre.
// Las reposiciones vistas se aplican primero a la reposición; si vio más de
// las que debía, el excedente también recupera festivos (una clase vista es
// una clase vista). Ambas cifras se topan en lo que le queda del paquete.
function splitDebt({ rain = 0, justified = 0, holidays = 0, madeUp = 0, remaining = 0, total = 0 } = {}) {
  if (!(total > 0)) return { pending: 0, calendar: 0 };
  const owedMakeup = rain + justified;
  const pending = Math.min(Math.max(0, roundUnits(owedMakeup - madeUp)), remaining);
  const extra = Math.max(0, madeUp - owedMakeup);
  const calendar = Math.min(Math.max(0, roundUnits(holidays - extra)), Math.max(0, roundUnits(remaining - pending)));
  return { pending, calendar };
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

function groupBy(list, key) {
  const out = {};
  for (const x of list) (out[x[key]] ||= []).push(x);
  return out;
}

// Registros de asistencia de clases regulares del semestre (para notMyDays).
function loadRegularRecords(ids, semester) {
  if (ids.length === 0) return Promise.resolve([]);
  return prisma.attendanceRecord.findMany({
    where: {
      studentId: { in: ids },
      session: { kind: 'REGULAR', date: { gte: new Date(semester.startDate), lte: new Date(semester.endDate) } },
    },
    select: { studentId: true, status: true, session: { select: { groupId: true, date: true } } },
  });
}

// Clases vistas y consumidas por estudiante (unidades) dentro del semestre
// dado — o históricas si no hay semestre. `before` (Date) limita a sesiones
// ANTERIORES a esa fecha: sirve para editar el reporte de la clase en que el
// estudiante justo terminó su paquete sin que desaparezca de su propio roster.
async function loadConsumption(students, semester, { before } = {}) {
  const seenById = {};
  const consumedById = {};
  const completedOnById = {};
  if (students.length === 0) return { seenById, consumedById, completedOnById };
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
      status: { in: ['PRESENTE', 'AUSENTE'] },
      ...(hasFilter ? { session: { date: dateFilter } } : {}),
    },
    select: {
      studentId: true, status: true,
      session: { select: { date: true, kind: true, effectiveUnits: true } },
    },
  });
  const byStudent = groupBy(records, 'studentId');
  for (const st of students) {
    const c = consumptionFromRecords(byStudent[st.id] || [], {
      classesStartDate: st.classesStartDate,
      total: (Number(st.classesAcquired) || 0) + (Number(st.previousClasses) || 0),
    });
    seenById[st.id] = c.seen;
    consumedById[st.id] = c.consumed;
    if (c.completedOn) completedOnById[st.id] = c.completedOn;
  }
  return { seenById, consumedById, completedOnById };
}

/**
 * Avance de todos los estudiantes activos (no de prueba) en el semestre activo.
 * [] si no hay semestre. Cada fila: total, seen (vistas), consumed (vistas +
 * faltas), remaining, completed (+ completedOn) y la fecha estimada de su
 * última clase. `studentIds` limita el cálculo (ficha de un estudiante).
 */
async function computeStudentProgress({ studentIds = null } = {}) {
  const semester = await prisma.semester.findFirst({
    where: { active: true },
    include: { exclusions: true },
  });
  if (!semester) return { semester: null, rows: [] };

  const today = bogotaToday();
  const students = await prisma.student.findMany({
    where: {
      active: true, isTrial: false, ...notSuspended(today),
      ...(studentIds ? { id: { in: studentIds } } : {}),
    },
    include: { enrollments: { include: { group: true } } },
    orderBy: { name: 'asc' },
  });
  const [{ seenById, consumedById, completedOnById }, regularRecords] = await Promise.all([
    loadConsumption(students, semester),
    loadRegularRecords(students.map((s) => s.id), semester),
  ]);
  const skipById = {};
  for (const [id, recs] of Object.entries(groupBy(regularRecords, 'studentId'))) skipById[id] = notMyDays(recs);

  // ¿Ya tiene registro hoy? Entonces la clase de hoy ya está contada en
  // lo consumido y la proyección arranca mañana.
  const reportedToday = new Set();
  const hasClassesLeft = (s) => {
    const c = computeCompletion({ acquired: s.classesAcquired, previous: s.previousClasses, consumed: consumedById[s.id] || 0 });
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
    const consumed = consumedById[s.id] || 0;
    const c = computeCompletion({ acquired: s.classesAcquired, previous: s.previousClasses, consumed });
    const groups = s.enrollments.map((e) => e.group).filter((g) => g?.active);
    const nearEnd = c.total > 0 && !c.completed && c.remaining <= SEMESTER_END_THRESHOLD;
    const from = reportedToday.has(s.id) ? tomorrow : today;
    const skip = skipById[s.id] || new Set();
    const pendingPkg = c.total > 0 && !c.completed;
    const end = pendingPkg
      ? projectEndDate(groups, semester, semester.exclusions, c.remaining, from, skip)
      : { date: null, beyondSemester: false };
    // ¿Le alcanza el calendario regular para ver lo que le falta antes del cierre?
    const leftInSemester = pendingPkg ? classesLeftInSemester(groups, semester, semester.exclusions, from, skip) : 0;
    const shortfall = pendingPkg ? Math.max(0, roundUnits(c.remaining - leftInSemester)) : 0;
    return {
      studentId: s.id,
      name: s.name,
      groups: groups.map((g) => g.code),
      total: c.total,
      seen,
      consumed,
      // Avance = consumidas / paquete (las faltas consumen la clase)
      pct: c.total > 0 ? Math.min(100, Math.round((consumed / c.total) * 100)) : null,
      remaining: c.remaining,
      completed: c.completed,
      completedOn: c.completed ? completedOnById[s.id] || null : null,
      nearEnd,
      projectedEnd: end.date,
      endsBeyondSemester: end.beyondSemester,
      leftInSemester,
      shortfall,
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
 * Lo que le falta a cada estudiante activo (no de prueba), separado en
 * REPOSICIÓN (lluvia + justificadas) y RECUPERAR POR CALENDARIO (festivos /
 * recesos) — ver splitDebt. Contado desde
 * SU ingreso (el último entre inscripción, creación del grupo y fecha de inicio
 * de clases):
 *
 *   reposición = canceladas por LLUVIA + JUSTIFICADAS − repuestas (sesión
 *                MAKEUP o registro REPOSICION)
 *   calendario = FESTIVOS / fechas excluidas ya pasadas en días de su grupo
 *                (sin los días N/A ni los festivos en que igual hubo clase)
 *
 * NO cuentan: la ausencia sin justificar (la perdió) ni las clases aún sin
 * reportar. `items` lista cada clase de origen con su tipo (trazabilidad).
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

  const [{ consumedById }, regularRecords, rainSessions, justified, makeupSeen] = await Promise.all([
    loadConsumption(students, semester),
    loadRegularRecords(ids, semester),
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
      select: { studentId: true, session: { select: { date: true, group: { select: { code: true } } } } },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        studentId: { in: ids },
        AND: [
          // Vista, o falta a una reposición: la perdió, también salda la deuda
          { OR: [seenAttendanceFilter(), { status: 'AUSENTE', session: { kind: 'MAKEUP' } }] },
          { OR: [{ attendanceType: 'REPOSICION' }, { session: { kind: 'MAKEUP' } }] },
          { session: { date: range } },
        ],
      },
      select: {
        studentId: true, status: true,
        session: { select: { date: true, kind: true, title: true, effectiveUnits: true, group: { select: { code: true } } } },
      },
    }),
  ]);

  const rainByGroup = {};
  for (const r of rainSessions) (rainByGroup[r.groupId] ||= []).push(dbDateStr(r.date));
  const recordsByStudent = groupBy(regularRecords, 'studentId');
  const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
  const justifiedByStudent = {};
  const justifiedItems = {};
  const startById = Object.fromEntries(students.map((s) => [s.id, s.classesStartDate]));
  for (const r of justified) {
    // Antes de que el estudiante empezara clases no es una falta real
    if (!absenceCounts(r.session?.date, startById[r.studentId])) continue;
    justifiedByStudent[r.studentId] = (justifiedByStudent[r.studentId] || 0) + 1;
    (justifiedItems[r.studentId] ||= []).push({
      type: 'JUSTIFIED', date: dbDateStr(r.session.date), groupCode: r.session.group?.code || null,
    });
  }
  const madeUpById = {};
  const madeUpItems = {};
  for (const r of makeupSeen) {
    const absent = r.status === 'AUSENTE' && r.session?.kind === 'MAKEUP';
    // Falta a una reposición antes de su inicio de clases: no cuenta
    if (absent && !absenceCounts(r.session?.date, startById[r.studentId])) continue;
    madeUpById[r.studentId] = (madeUpById[r.studentId] || 0) + attendanceUnits(r.session);
    (madeUpItems[r.studentId] ||= []).push({
      date: dbDateStr(r.session.date),
      label: r.session.kind === 'MAKEUP' ? (r.session.title || 'Reposición') : (r.session.group?.code || 'Clase'),
      units: attendanceUnits(r.session),
      absent,
    });
  }
  const reasonByDate = Object.fromEntries(semester.exclusions.map((e) => [dbDateStr(e.date), e.reason || null]));

  const todayStr = dbDateStr(today);
  // Sin repetidos: una misma fecha cargada dos veces es un solo festivo
  const exclusionDates = [...new Set(semester.exclusions.map((e) => dbDateStr(e.date)))].filter((d) => d <= todayStr);
  // Festivo en el que el grupo igual tuvo clase (o ya se contó como lluvia):
  // no se perdió nada por el festivo
  const heldOnHoliday = new Set();
  if (exclusionDates.length > 0 && groupIds.length > 0) {
    const held = await prisma.classSession.findMany({
      where: {
        kind: 'REGULAR', groupId: { in: groupIds },
        date: { in: exclusionDates.map((d) => new Date(`${d}T00:00:00.000Z`)) },
        OR: [{ status: { in: ['REALIZADA', 'CANCELADA_MITAD'] } }, { status: 'CANCELADA', cancellationCategory: 'LLUVIA' }],
      },
      select: { groupId: true, date: true },
    });
    for (const h of held) heldOnHoliday.add(`${h.groupId}:${dbDateStr(h.date)}`);
  }

  const rows = students.map((s) => {
    let rain = 0;
    let holidays = 0;
    const items = [...(justifiedItems[s.id] || [])];
    const skip = notMyDays(recordsByStudent[s.id] || []);
    for (const e of s.enrollments) {
      if (!e.group?.active) continue;
      const floor = new Date(Math.max(
        new Date(e.enrolledAt), new Date(e.group.createdAt),
        ...(s.classesStartDate ? [new Date(s.classesStartDate)] : [])
      ));
      const floorStr = dbDateStr(floor);
      const rainDates = (rainByGroup[e.groupId] || []).filter((d) => d >= floorStr && !skip.has(`${e.groupId}:${dow(d)}`));
      // Festivos / fechas excluidas ya pasadas que caían en un día de su grupo
      const holidayDates = exclusionDates.filter((d) => d >= floorStr && e.group[DAY_FIELDS[dow(d)]]
        && !skip.has(`${e.groupId}:${dow(d)}`) && !heldOnHoliday.has(`${e.groupId}:${d}`));
      rain += rainDates.length;
      holidays += holidayDates.length;
      for (const d of rainDates) items.push({ type: 'RAIN', date: d, groupCode: e.group.code });
      for (const d of holidayDates) items.push({ type: 'HOLIDAY', date: d, groupCode: e.group.code, reason: reasonByDate[d] });
    }
    items.sort((a, b) => a.date.localeCompare(b.date));
    const justifiedCount = justifiedByStudent[s.id] || 0;
    const madeUp = roundUnits(madeUpById[s.id] || 0);
    const c = computeCompletion({
      acquired: s.classesAcquired, previous: s.previousClasses, consumed: consumedById[s.id] || 0,
    });
    // Sin paquete registrado no hay contra qué topar: no se reporta deuda
    const { pending, calendar } = splitDebt({
      rain, justified: justifiedCount, holidays, madeUp, remaining: c.remaining, total: c.total,
    });
    return {
      studentId: s.id,
      name: s.name,
      groups: s.enrollments.map((e) => e.group).filter((g) => g?.active).map((g) => g.code),
      // pending = clases de REPOSICIÓN (lluvia + justificadas − repuestas)
      // calendar = clases por RECUPERAR POR CALENDARIO (festivos / recesos)
      rain, justified: justifiedCount, holidays, madeUp, pending, calendar,
      remaining: c.remaining,
      // Detalle: clases que originan la deuda y reposiciones ya vistas
      items,
      madeUpItems: (madeUpItems[s.id] || []).sort((a, b) => a.date.localeCompare(b.date)),
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
        studentId: p.studentId, name: p.name, seen: p.seen, consumed: p.consumed, total: p.total, pct: p.pct,
        remaining: p.remaining, completed: p.completed,
        pending: d.pending || 0, calendar: d.calendar || 0,
        rain: d.rain || 0, justified: d.justified || 0, holidays: d.holidays || 0,
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
      // Festivos / recesos que el calendario debe devolverles (no son reposición)
      calendarClasses: roundUnits(students.reduce((acc, st) => acc + st.calendar, 0)),
      studentsWithCalendar: students.filter((st) => st.calendar > 0).length,
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
  notMyDays,
  splitDebt,
  classesLeftInSemester,
  projectEndDate,
  holidayDeviationForGroup,
  loadConsumption,
  consumptionFromRecords,
  computeStudentProgress,
  computeGroupHolidayDeviation,
  computeMakeupDebt,
  computeGroupsProgress,
  DAY_FIELDS,
};
