// Single source of truth for what counts as a "clase vista" (class consumed
// from the student's package):
//   - PRESENTE in any session (regular, reposición o festival)
//   - AUSENTE in a FESTIVAL (regla del cliente: en festivales la presencia Y
//     la ausencia cuentan como clase dictada; las justificadas se omiten)
// NO_APLICA queda excluido por diseño (allowlist): no es asistencia ni ausencia
// y no consume paquete.
function seenAttendanceFilter() {
  return {
    OR: [
      { status: 'PRESENTE' },
      { status: 'AUSENTE', session: { kind: 'FESTIVAL' } },
    ],
  };
}

// Las inasistencias solo cuentan a partir de la fecha de inicio de clases del
// estudiante (classesStartDate): una AUSENTE anterior no es una falta real —
// el estudiante aún no empezaba clases — así que no suma faltas, no entra al
// denominador de asistencia y no consume paquete (AUSENTE en festival). Sin
// fecha de inicio (o sin fecha de sesión) la falta cuenta normal.
function absenceCounts(sessionDate, classesStartDate) {
  if (!classesStartDate || !sessionDate) return true;
  return new Date(sessionDate).getTime() >= new Date(classesStartDate).getTime();
}

// Client-side variant for record arrays already loaded with their session kind.
// sessionDate/classesStartDate son opcionales: si se pasan, la AUSENTE de
// festival solo cuenta desde el inicio de clases del estudiante.
function isSeenRecord(record, sessionKind, sessionDate, classesStartDate) {
  if (record.status === 'PRESENTE') return true;
  if (record.status !== 'AUSENTE' || sessionKind !== 'FESTIVAL') return false;
  return absenceCounts(sessionDate, classesStartDate);
}

// ─── Reposiciones sencillas y dobles ──────────────────────────────────────
// Una reposición grupal se programa declarando "por cuántas asistencias cuenta"
// (ClassSession.effectiveUnits): sencilla = 1, doble = 2. Ese valor es la única
// fuente de verdad de cuántas clases del paquete recupera el estudiante que
// asiste. Las clases regulares y los festivales siempre valen 1.0, así que
// multiplicar por las unidades es seguro en cualquier sesión.
function attendanceUnits(session) {
  const units = parseFloat(session?.effectiveUnits);
  return Number.isFinite(units) && units > 0 ? units : 1;
}

// Clases que ESTE registro consume del paquete del estudiante: 0 si no es
// "clase vista", si no las unidades de la sesión (2 en una reposición doble).
function seenUnits(record, session, classesStartDate) {
  if (!isSeenRecord(record, session?.kind, session?.date, classesStartDate)) return 0;
  return attendanceUnits(session);
}

// Las unidades admiten medios (0.5), así que los acumulados se redondean a un
// decimal para no arrastrar ruido de punto flotante en las vistas.
function roundUnits(total) {
  return Math.round((total + Number.EPSILON) * 10) / 10;
}

module.exports = { seenAttendanceFilter, isSeenRecord, absenceCounts, attendanceUnits, seenUnits, roundUnits };
