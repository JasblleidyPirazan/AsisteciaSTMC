// Historial de asistencia de UN estudiante + su resumen. Lo usan el reporte del
// estudiante (`GET /reports/student/:id`) y el portal de padres
// (`GET /parent/attendance/:id`): una sola función para que den las mismas cifras.
//
// El resumen sale del ledger (nada se recuenta aquí). El listado clase a clase usa
// por defecto la misma ventana del ledger (D4: desde el inicio del semestre hasta
// el inicio del siguiente), o `from`/`to` si se piden.
const prisma = require('../lib/prisma');
const { loadLedgers, ledgerBrief } = require('./studentLedger');

async function loadStudentAttendance(studentId, { from, to, groupSelect } = {}) {
  const { ledgers, window } = await loadLedgers({ studentIds: [studentId] });
  const ledger = ledgers[0] || null;

  const where = { studentId };
  const date = {};
  if (from) date.gte = new Date(from);
  else if (!to && window) date.gte = new Date(`${window.from}T00:00:00.000Z`);
  if (to) date.lte = new Date(to);
  else if (!from && window?.to) date.lt = new Date(`${window.to}T00:00:00.000Z`);
  if (Object.keys(date).length) where.session = { date };

  const records = await prisma.attendanceRecord.findMany({
    where,
    include: { session: { include: { group: { select: groupSelect || { id: true, code: true, name: true } } } } },
    orderBy: { session: { date: 'desc' } },
  });

  return {
    records,
    summary: {
      total: records.length,
      present: ledger ? ledger.asistencia.presentes : 0,
      absent: ledger ? ledger.asistencia.faltas : 0,
      justified: ledger ? ledger.noConsumen.justificadas : 0,
      na: ledger ? ledger.noConsumen.na : 0,
      classesSeen: ledger ? ledger.consumidas.total : 0,
      attendanceRate: ledger ? (ledger.asistencia.tasa ?? 0) : 0,
    },
    ledger: ledgerBrief(ledger),
  };
}

module.exports = { loadStudentAttendance };
