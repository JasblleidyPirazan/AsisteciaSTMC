const { bogotaToday } = require('./dates');

// Prisma where-fragment: student is NOT under an active suspension today.
// Suspension visibility is resolved per-query so students reappear
// automatically when the range ends — no cron needed.
function notSuspended(today = bogotaToday()) {
  return {
    NOT: {
      AND: [
        { suspendedFrom: { lte: today } },
        { suspendedUntil: { gte: today } },
      ],
    },
  };
}

module.exports = { notSuspended };
