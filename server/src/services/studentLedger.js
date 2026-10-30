// Ledger del paquete de clases de UN estudiante.
//
// `buildLedger(input)` es una función PURA: no usa Prisma ni la fecha del
// sistema (recibe `today`). Implementa, campo por campo, la especificación de
// "Reglas de negocio del paquete" (CLAUDE.md y docs/brief-implementacion.md,
// secciones 0 y 1). Una sola definición de cada predicado y de cada cifra: todas
// las pantallas leen de aquí (tareas T5–T9 conectan cargador, endpoints y UI).
//
// Todas las fechas se manejan como cadenas YYYY-MM-DD (Bogotá / @db.Date).
// Acepta también Date: se normalizan al entrar.
const { roundUnits: round1 } = require('./attendanceStats');
const { DAY_FIELDS } = require('./schedule');

// Días hacia adelante que se buscan para la fecha estimada de fin (proyeccion.fin)
const SEARCH_DAYS = 400;
const FAR_PAST = '0000-01-01';

const GRAY_STATUSES = ['GRADUADO', 'PRUEBA', 'SUSPENDIDO', 'INACTIVO'];

// ─── Fechas ───────────────────────────────────────────────────────────────

const ds = (d) => {
  if (d == null || d === '') return null;
  return typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
};
const weekday = (date) => new Date(`${date}T00:00:00.000Z`).getUTCDay();
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const maxDate = (...list) => list.filter(Boolean).reduce((a, b) => (a > b ? a : b));

// units(session): las unidades de una sesión; 1 si no hay dato válido
function units(session) {
  const u = parseFloat(session?.effectiveUnits);
  return Number.isFinite(u) && u > 0 ? u : 1;
}

// ─── Ledger ───────────────────────────────────────────────────────────────

function buildLedger(input) {
  const student = input.student;
  const today = ds(input.today);
  const semesterEnd = ds(input.semesterEnd);
  const window = { from: ds(input.window?.from) || FAR_PAST, to: ds(input.window?.to) };
  const classesStart = ds(student.classesStartDate);
  const suspFrom = ds(student.suspendedFrom);
  const suspUntil = ds(student.suspendedUntil);

  // ── Predicados (una sola definición cada uno) ──
  const inWindow = (date) => window.from <= date && (window.to === null || date < window.to);
  const suspended = (date) => !!(suspFrom && suspUntil && suspFrom <= date && date <= suspUntil);
  const absenceCounts = (date) => (classesStart === null || date >= classesStart) && !suspended(date);

  // Exclusiones (festivos / recesos): fechas únicas dentro de la ventana, con su motivo
  const exclusions = new Map();
  // (cada exclusión puede ser 'YYYY-MM-DD', un Date o { date, reason })
  for (const e of input.exclusions || []) {
    const plain = typeof e === 'string' || e instanceof Date;
    const date = ds(plain ? e : e?.date);
    if (date && inWindow(date) && !exclusions.has(date)) {
      exclusions.set(date, plain ? null : (e.reason || null));
    }
  }

  const enrollments = (input.enrollments || []).map((e) => ({
    groupId: e.groupId,
    group: e.group,
    // null o lista vacía = todos los días del grupo
    weekdays: Array.isArray(e.weekdays) && e.weekdays.length > 0 ? e.weekdays : null,
    floor: maxDate(ds(e.enrolledAt), ds(e.group?.createdAt), classesStart),
  }));
  const enrollmentOf = (groupId) => enrollments.find((e) => e.groupId === groupId);
  const groupCode = (groupId) => enrollmentOf(groupId)?.group?.code ?? null;

  const takesDay = (enr, date) => {
    const wd = weekday(date);
    return enr.weekdays ? enr.weekdays.includes(wd) : !!enr.group?.[DAY_FIELDS[wd]];
  };
  // ¿Esta fecha es una clase que le toca en este grupo? (`ignoreExclusions`: para
  // contar los festivos, que son justo las fechas excluidas)
  const isMine = (enr, date, { ignoreExclusions = false } = {}) =>
    !!enr.group?.active
    && takesDay(enr, date)
    && date >= enr.floor
    && !suspended(date)
    && (ignoreExclusions || !exclusions.has(date));

  // Solo cuentan registros y sesiones dentro de la ventana
  const records = (input.records || [])
    .map((r) => ({
      status: r.status,
      attendanceType: r.attendanceType ?? 'REGULAR',
      session: r.session || {},
      date: ds(r.session?.date),
    }))
    .filter((r) => r.date && inWindow(r.date))
    .map((r) => ({ ...r, makeup: r.attendanceType === 'REPOSICION' || r.session.kind === 'MAKEUP' }));

  const sessions = (input.sessions || [])
    .map((s) => ({ ...s, kind: s.kind || 'REGULAR', date: ds(s.date) }))
    .filter((s) => s.date && inWindow(s.date));

  const sessionsAt = new Map(); // `${groupId}|${date}` → sesiones
  for (const s of sessions) {
    const key = `${s.groupId}|${s.date}`;
    if (!sessionsAt.has(key)) sessionsAt.set(key, []);
    sessionsAt.get(key).push(s);
  }
  // heldOn(groupId, date): hay sesión de ese grupo y fecha REALIZADA o CANCELADA
  const heldOn = (groupId, date) =>
    (sessionsAt.get(`${groupId}|${date}`) || []).some((s) => s.status === 'REALIZADA' || s.status === 'CANCELADA');

  // ── paquete ──
  const adquiridas = Number(student.classesAcquired) || 0;
  const previas = Number(student.previousClasses) || 0;
  const paquete = { adquiridas, previas, total: adquiridas + previas };

  // ── consumidas ──
  // Cada consumo es un evento con fecha: sirven para las sumas y para saber con
  // qué clase se completó el paquete (graduadoEl) — una sola fuente.
  const events = []; // { date, units, kind: 'presentes' | 'ausentes' | 'reposiciones' }
  for (const r of records) {
    const u = units(r.session);
    if (r.status === 'PRESENTE') {
      events.push({ date: r.date, units: u, kind: r.makeup ? 'reposiciones' : 'presentes' });
    } else if (r.status === 'AUSENTE' && absenceCounts(r.date)) {
      events.push({ date: r.date, units: u, kind: r.makeup ? 'reposiciones' : 'ausentes' });
    }
  }
  // D2: una clase cancelada SIN_ESTUDIANTES consume una clase a quien le tocaba
  // ese día (derivado: no hay registro del estudiante en esa sesión)
  const recordedSessionIds = new Set(records.map((r) => r.session.id).filter(Boolean));
  const noStudentsSessions = sessions.filter((s) =>
    s.kind === 'REGULAR' && s.status === 'CANCELADA' && s.cancellationCategory === 'SIN_ESTUDIANTES');
  for (const s of noStudentsSessions) {
    const enr = enrollmentOf(s.groupId);
    if (enr && isMine(enr, s.date) && !recordedSessionIds.has(s.id)) {
      events.push({ date: s.date, units: 1, kind: 'ausentes' });
    }
  }
  const sumKind = (kind) => events.filter((e) => e.kind === kind).reduce((acc, e) => acc + e.units, 0);
  const consumidasTotal = round1(events.reduce((acc, e) => acc + e.units, 0));
  const consumidas = {
    presentes: round1(sumKind('presentes')),
    ausentes: round1(sumKind('ausentes')),
    reposicionesVistas: round1(sumKind('reposiciones')),
    total: consumidasTotal,
    excedente: Math.max(0, round1(consumidasTotal - paquete.total)),
  };

  // ── noConsumen ──
  const noConsumen = {
    justificadas: records.filter((r) => r.status === 'JUSTIFICADA').length,
    na: records.filter((r) => r.status === 'NO_APLICA').length,
  };

  // ── pendientes.total (lo que falta para llegar a "pagadas = vistas") ──
  const pendientesTotal = Math.max(0, round1(paquete.total - consumidas.total));

  // ── reposicion (derecho que la Escuela debe ofrecer) ──
  const cancelledMine = (category) => sessions.filter((s) => {
    if (s.kind !== 'REGULAR' || s.status !== 'CANCELADA' || s.cancellationCategory !== category) return false;
    const enr = enrollmentOf(s.groupId);
    return !!enr && s.date <= today && isMine(enr, s.date);
  });
  const rainSessions = cancelledMine('LLUVIA');
  const otherSessions = cancelledMine('OTRA');
  // Una J en festival o en reposición no genera derecho (D3): solo en clase regular
  const justifiedRights = records.filter((r) =>
    r.status === 'JUSTIFICADA' && r.session.kind === 'REGULAR' && r.attendanceType === 'REGULAR' && absenceCounts(r.date));
  const derecho = rainSessions.length + otherSessions.length + justifiedRights.length;
  const repuestas = consumidas.reposicionesVistas; // una falta a la reposición la pierde y salda la deuda
  const reposicionPendientes = round1(Math.min(Math.max(0, derecho - repuestas), pendientesTotal));
  const agendadas = round1((input.scheduled || []).reduce((acc, s) => acc + units(s), 0));
  const reposicion = {
    lluvia: rainSessions.length,
    otras: otherSessions.length,
    justificadas: justifiedRights.length,
    derecho,
    repuestas,
    pendientes: reposicionPendientes,
    agendadas,
    porAgendar: Math.max(0, round1(reposicionPendientes - agendadas)),
    items: [
      ...rainSessions.map((s) => ({ type: 'RAIN', date: s.date, groupCode: groupCode(s.groupId) })),
      ...otherSessions.map((s) => ({ type: 'OTHER', date: s.date, groupCode: groupCode(s.groupId) })),
      ...justifiedRights.map((r) => ({ type: 'JUSTIFIED', date: r.date, groupCode: groupCode(r.session.groupId) })),
    ].sort((a, b) => a.date.localeCompare(b.date)),
    repuestasItems: records
      .filter((r) => r.makeup && (r.status === 'PRESENTE' || (r.status === 'AUSENTE' && absenceCounts(r.date))))
      .map((r) => ({
        date: r.date,
        label: r.session.title || 'Reposición',
        units: units(r.session),
        absent: r.status === 'AUSENTE',
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };

  // ── calendario (reprogramación: festivos y recesos no se reponen) ──
  const festivoItems = [];
  for (const [date, reason] of exclusions) {
    if (date > today) continue;
    for (const enr of enrollments) {
      if (isMine(enr, date, { ignoreExclusions: true }) && !heldOn(enr.groupId, date)) {
        festivoItems.push({ date, groupCode: enr.group?.code ?? null, reason });
      }
    }
  }
  festivoItems.sort((a, b) => a.date.localeCompare(b.date));
  const sobranteReposicion = Math.max(0, round1(repuestas - derecho));
  const calendario = {
    festivos: festivoItems.length,
    recuperables: round1(Math.min(
      Math.max(0, festivoItems.length - sobranteReposicion),
      Math.max(0, round1(pendientesTotal - reposicionPendientes)),
    )),
    items: festivoItems,
  };

  // ── pendientes (necesidad: siempre suma) ──
  // Las clases que le tocan: pares (grupo, fecha) — un estudiante en dos grupos
  // el mismo día tiene dos clases
  const mineDates = (from, to) => {
    const out = [];
    for (const enr of enrollments) {
      let d = maxDate(from, enr.floor, window.from);
      for (; d <= to; d = addDays(d, 1)) {
        if (isMine(enr, d)) out.push({ groupId: enr.groupId, date: d });
      }
    }
    return out;
  };
  const hasRecordToday = records.some((r) => r.date === today);
  const from = hasRecordToday ? addDays(today, 1) : today;
  const restantesEnSemestre = semesterEnd && from <= semesterEnd ? mineDates(from, semesterEnd).length : 0;
  const cubreCalendario = Math.min(pendientesTotal, restantesEnSemestre);
  const resto1 = round1(pendientesTotal - cubreCalendario);
  const agendadasAplicadas = Math.min(resto1, agendadas);
  const resto2 = round1(resto1 - agendadasAplicadas);
  const porAgendar = Math.min(resto2, Math.max(0, round1(reposicionPendientes - agendadasAplicadas)));
  const pendientes = {
    total: pendientesTotal,
    from,
    restantesEnSemestre,
    cubreCalendario,
    agendadasAplicadas,
    porAgendar,
    deficit: round1(resto2 - porAgendar),
  };

  // ── sinConsolidar ──
  let clasesSinCerrar = 0;
  for (const enr of enrollments) {
    for (let d = maxDate(enr.floor, window.from); d <= today; d = addDays(d, 1)) {
      if (isMine(enr, d) && !heldOn(enr.groupId, d)) clasesSinCerrar += 1;
    }
  }
  const sinConsolidar = {
    clases: clasesSinCerrar,
    conflictos: sessions.filter((s) => {
      if (s.consolidationStatus !== 'MISMATCH') return false;
      const enr = enrollmentOf(s.groupId);
      return !!enr && isMine(enr, s.date);
    }).length,
  };

  // ── proyeccion ──
  const n = Math.ceil(Math.max(0, pendientesTotal - agendadas));
  let fin = null;
  if (n > 0) {
    const dates = mineDates(from, addDays(from, SEARCH_DAYS)).map((x) => x.date).sort();
    fin = dates.length >= n ? dates[n - 1] : null;
  }
  const proyeccion = { n, fin, excedeSemestre: !!(fin && semesterEnd && fin > semesterEnd) };

  // ── asistencia (comportamiento, D6: no es del paquete) ──
  const presentesAsist = records.filter((r) => r.status === 'PRESENTE').length;
  const faltas = records.filter((r) => r.status === 'AUSENTE' && absenceCounts(r.date)).length;
  const asistencia = {
    presentes: presentesAsist,
    faltas,
    justificadas: noConsumen.justificadas,
    tasa: presentesAsist + faltas > 0 ? Math.round((presentesAsist / (presentesAsist + faltas)) * 100) : null,
  };

  // ── status (prioridad de arriba hacia abajo) ──
  const totalPaid = Number(input.tuition?.totalPaid) || 0;
  const expectedTotal = input.tuition?.expectedTotal ?? null;
  const payStatus = () => {
    if (expectedTotal !== null && totalPaid >= expectedTotal) return 'MATRICULADO';
    if (totalPaid > 0) return 'INSCRITO';
    return 'PREINSCRITO';
  };
  const base = (() => {
    if (!student.active) return 'INACTIVO';
    if (suspended(today)) return 'SUSPENDIDO';
    if (student.isTrial) return 'PRUEBA';
    return null;
  })();
  const graduated = !base && paquete.total > 0 && pendientesTotal === 0;
  const status = base || (graduated ? 'GRADUADO' : payStatus());
  const tuitionStatus = base || payStatus();

  // graduadoEl: fecha del consumo con el que se alcanzó el paquete (cronológico)
  let graduadoEl = null;
  if (graduated) {
    let running = 0;
    for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
      running += e.units;
      if (round1(running) >= paquete.total) { graduadoEl = e.date; break; }
    }
  }

  // ── semáforo (uno solo, calculado en el servidor) ──
  let semaforo = 'VERDE';
  if (GRAY_STATUSES.includes(status)) semaforo = 'GRIS';
  else if (paquete.total === 0 || pendientes.deficit > 0 || sinConsolidar.clases >= 3) semaforo = 'ROJO';
  else if (reposicion.porAgendar > 0 || sinConsolidar.clases > 0) semaforo = 'AMBAR';

  return {
    studentId: student.id,
    name: student.name,
    status,
    tuitionStatus,
    graduadoEl,
    semaforo,
    paquete,
    consumidas,
    noConsumen,
    reposicion,
    calendario,
    pendientes,
    sinConsolidar,
    proyeccion,
    asistencia,
    // Se conserva para que la ruta lo quite a los roles sin acceso económico
    tuition: { totalPaid, expectedTotal },
  };
}

module.exports = { buildLedger, SEARCH_DAYS };
