// Single source of truth for what counts as a "clase vista" (class consumed
// from the student's package):
//   - PRESENTE in any session (regular, reposición o festival)
//   - AUSENTE in a FESTIVAL (regla del cliente: en festivales la presencia Y
//     la ausencia cuentan como clase dictada; las justificadas se omiten)
function seenAttendanceFilter() {
  return {
    OR: [
      { status: 'PRESENTE' },
      { status: 'AUSENTE', session: { kind: 'FESTIVAL' } },
    ],
  };
}

// Client-side variant for record arrays already loaded with their session kind
function isSeenRecord(record, sessionKind) {
  if (record.status === 'PRESENTE') return true;
  return record.status === 'AUSENTE' && sessionKind === 'FESTIVAL';
}

module.exports = { seenAttendanceFilter, isSeenRecord };
