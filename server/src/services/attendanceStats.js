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

module.exports = { seenAttendanceFilter, isSeenRecord, absenceCounts };
