// Calendario por grupo contra su plan de clases (plan de 40, 20 si es de un solo
// día): festivos y recesos, lluvia, fecha de fin planeada y estimada, y el avance
// de cada grupo con el de sus estudiantes.
//
// Lo que es DE UN ESTUDIANTE (clases consumidas, por reponer, por recuperar por
// calendario, déficit, graduado…) ya no se calcula aquí: vive en
// `services/studentLedger.js`, una sola definición para todo el sistema.
const prisma = require('../lib/prisma');
const { scheduledDatesBetween, DAY_FIELDS } = require('./schedule');
const { dbDateStr, bogotaToday } = require('../lib/dates');
const { loadLedgers } = require('./studentLedger');

// ─── Lógica pura ──────────────────────────────────────────────────────────

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
async function loadGroupSessionCounts(groups, semester, todayStr, window = null) {
  const given = {};
  const rain = {};
  const givenToday = {};
  if (groups.length === 0) return { given, rain, givenToday };
  const sessions = await prisma.classSession.findMany({
    where: {
      kind: 'REGULAR',
      groupId: { in: groups.map((g) => g.id) },
      // Con `window` (D4) cuenta lo dictado hasta el inicio del siguiente semestre;
      // sin ella, el rango clásico inicio–fin del semestre
      date: window
        ? { gte: new Date(`${window.from}T00:00:00.000Z`), ...(window.to ? { lt: new Date(`${window.to}T00:00:00.000Z`) } : {}) }
        : { gte: new Date(semester.startDate), lte: new Date(semester.endDate) },
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
 * Avance de cada grupo activo en el semestre (Reportes → Avance de grupos):
 * fecha de inicio del plan, fecha final estimada, clases dadas, clases no dadas por
 * festivos / recesos y por lluvia, y el avance de cada uno de sus estudiantes
 * (del ledger: consumidas / paquete, por reponer, déficit, fecha estimada de fin).
 */
async function computeGroupsProgress() {
  const loaded = await loadLedgers();
  if (!loaded.semester) return { semester: null, groups: [] };
  const { semester, window, today: todayStr, exclusions } = loaded;

  const [groups, plan] = await Promise.all([
    prisma.group.findMany({
      where: { active: true },
      include: { professor: { select: { id: true, name: true } } },
    }),
    getPlanClasses(),
  ]);
  const counts = await loadGroupSessionCounts(groups, semester, todayStr, window);

  // Estudiantes de cada grupo (activos, no de prueba, no suspendidos). Un estudiante
  // en dos grupos aparece en ambos.
  const r1 = (n) => Math.round(n * 10) / 10;
  const studentsByGroup = {};
  for (const l of loaded.ledgers) {
    if (['INACTIVO', 'PRUEBA', 'SUSPENDIDO'].includes(l.status)) continue;
    const row = {
      studentId: l.studentId, name: l.name,
      seen: r1(l.consumidas.presentes + l.consumidas.reposicionesVistas),
      consumed: l.consumidas.total,
      total: l.paquete.total,
      pct: l.paquete.total > 0 ? Math.min(100, Math.round((l.consumidas.total / l.paquete.total) * 100)) : null,
      remaining: l.pendientes.total,
      completed: l.status === 'GRADUADO',
      pending: l.reposicion.pendientes, calendar: l.calendario.recuperables,
      rain: l.reposicion.lluvia, justified: l.reposicion.justificadas, holidays: l.calendario.festivos,
      deficit: l.pendientes.deficit, semaforo: l.semaforo,
      projectedEnd: l.proyeccion.fin, endsBeyondSemester: l.proyeccion.excedeSemestre,
    };
    for (const g of l.groups) (studentsByGroup[g.id] ||= []).push(row);
  }

  const rows = groups.map((g) => {
    const cal = holidayDeviationForGroup(g, semester, exclusions, {
      plan, todayStr,
      given: counts.given[g.id] || 0, rain: counts.rain[g.id] || 0, givenToday: !!counts.givenToday[g.id],
    });
    const students = (studentsByGroup[g.id] || []).sort((a, b) => a.name.localeCompare(b.name, 'es'));
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
      makeupClasses: r1(students.reduce((acc, st) => acc + st.pending, 0)),
      studentsWithMakeups: students.filter((st) => st.pending > 0).length,
      // Festivos / recesos que el calendario debe devolverles (no son reposición)
      calendarClasses: r1(students.reduce((acc, st) => acc + st.calendar, 0)),
      studentsWithCalendar: students.filter((st) => st.calendar > 0).length,
      // Déficit: clases que ni el calendario ni las reposiciones cubren
      deficitClasses: r1(students.reduce((acc, st) => acc + st.deficit, 0)),
      studentsWithDeficit: students.filter((st) => st.deficit > 0).length,
      studentsCount: students.length,
      students,
    };
  }).sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));

  return {
    semester,
    today: todayStr,
    plan,
    groups: rows,
  };
}

module.exports = {
  holidayDeviationForGroup,
  loadGroupSessionCounts,
  getPlanClasses,
  computeGroupHolidayDeviation,
  computeGroupsProgress,
  DAY_FIELDS,
};
