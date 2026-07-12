const prisma = require('./prisma');
const { getPeriodForDate } = require('../services/costEngine');

// A fortnight (period) is locked once it has been closed (cierre de quincena)
// and not reopened. While locked, its reports/costs must not be edited.
async function isPeriodLocked(period) {
  if (!period) return false;
  const closure = await prisma.payrollClosure.findUnique({ where: { period } });
  return !!closure && closure.locked;
}

// Convenience: is the fortnight of this session's date locked?
async function isSessionPeriodLocked(date) {
  return isPeriodLocked(getPeriodForDate(date));
}

module.exports = { isPeriodLocked, isSessionPeriodLocked };
