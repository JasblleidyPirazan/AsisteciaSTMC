// Avance de las reposiciones (pantalla "Reposiciones y reprogramación").
//
// Lógica pura sobre los ledgers (la única definición del paquete): no recuenta
// nada por su cuenta, solo suma lo que cada ledger ya dice y lo reparte por semana.
//
//   causadas     = Σ reposicion.derecho          (lluvia + canceladas por la Escuela + justificadas)
//   dictadas     = Σ reposicion.repuestas        (reposiciones vistas; una falta a la reposición
//                                                 también la salda: se cuentan aparte como "perdidas")
//   aplicadas    = Σ min(repuestas, derecho)     (lo dictado que salda reposición; el resto
//                                                 recupera festivos, regla del ledger)
//   pendientes   = Σ reposicion.pendientes       = programadas + porAgendar
//   programadas  = Σ min(agendadas, pendientes)  (reservas de reposición aún sin reportar)
//   porAgendar   = pendientes − programadas
//   sinReponer   = causadas − aplicadas − pendientes  (ya no se reponen: el estudiante
//                                                 completó su paquete con otras clases)
// Así siempre: causadas = aplicadas + programadas + porAgendar + sinReponer.
//
// Por semana (lunes a domingo, hora de Bogotá): causadas por tipo (fecha de la
// clase de origen), dictadas (asistió) y perdidas (faltó) por fecha de la
// reposición, y programadas por la fecha del turno reservado.

const OUT_OF_SCOPE = ['INACTIVO', 'PRUEBA']; // mismo alcance que summarizeLedgers (D10)

const round1 = (n) => Math.round(n * 10) / 10;

function weekStart(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const inScope = (l) => l.paquete.total > 0 && !OUT_OF_SCOPE.includes(l.status);

/**
 * ledgers:   los de loadLedgers
 * scheduled: [{ studentId, date: 'YYYY-MM-DD', units }] reservas de reposición PROGRAMADA
 * today:     'YYYY-MM-DD'
 * Devuelve { totals, weeks }.
 */
function buildMakeupProgress({ ledgers = [], scheduled = [], today }) {
  const scope = ledgers.filter(inScope);
  const ids = new Set(scope.map((l) => l.studentId));

  const totals = {
    students: scope.filter((l) => l.reposicion.derecho > 0).length,
    causadas: 0, lluvia: 0, otras: 0, justificadas: 0,
    dictadas: 0, asistidas: 0, perdidas: 0, aplicadas: 0,
    pendientes: 0, programadas: 0, porAgendar: 0, sinReponer: 0,
  };
  const weeks = {};
  const week = (date) => {
    const ws = weekStart(date);
    return (weeks[ws] ||= {
      weekStart: ws, weekEnd: addDays(ws, 6),
      lluvia: 0, otras: 0, justificadas: 0, causadas: 0,
      asistidas: 0, perdidas: 0, dictadas: 0, programadas: 0,
    });
  };

  for (const l of scope) {
    const r = l.reposicion;
    totals.causadas += r.derecho;
    totals.lluvia += r.lluvia;
    totals.otras += r.otras;
    totals.justificadas += r.justificadas;
    totals.dictadas += r.repuestas;
    const aplicadas = Math.min(r.repuestas, r.derecho);
    totals.aplicadas += aplicadas;
    totals.pendientes += r.pendientes;
    const programadas = Math.min(r.agendadas, r.pendientes);
    totals.programadas += programadas;
    totals.porAgendar += Math.max(0, r.pendientes - programadas);
    totals.sinReponer += Math.max(0, r.derecho - aplicadas - r.pendientes);

    for (const it of r.items || []) {
      const w = week(it.date);
      const key = it.type === 'RAIN' ? 'lluvia' : it.type === 'OTHER' ? 'otras' : 'justificadas';
      w[key] += 1;
      w.causadas += 1;
    }
    for (const it of r.repuestasItems || []) {
      const w = week(it.date);
      const u = Number(it.units) || 1;
      if (it.absent) { w.perdidas += u; totals.perdidas += u; } else { w.asistidas += u; totals.asistidas += u; }
      w.dictadas += u;
    }
  }
  for (const s of scheduled) {
    if (!ids.has(s.studentId)) continue;
    week(s.date).programadas += Number(s.units) || 1;
  }

  for (const k of Object.keys(totals)) totals[k] = round1(totals[k]);
  const list = Object.values(weeks)
    .map((w) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, typeof v === 'number' ? round1(v) : v])))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  // Saldo acumulado: lo causado que todavía no se ha dictado al cierre de cada semana
  let saldo = 0;
  const currentWeek = today ? weekStart(today) : null;
  for (const w of list) {
    saldo = round1(saldo + w.causadas - w.dictadas);
    w.saldo = Math.max(0, saldo);
    w.current = w.weekStart === currentWeek;
    w.future = !!currentWeek && w.weekStart > currentWeek;
  }
  return { totals, weeks: list };
}

module.exports = { buildMakeupProgress, weekStart };
