// Date helpers pinned to the school's timezone. session.date and the Student
// suspension range are @db.Date (UTC midnight), so all "same day" comparisons
// are done on YYYY-MM-DD strings computed in America/Bogota.

const BOGOTA_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// YYYY-MM-DD of the given instant as seen in Bogota (defaults to now)
function bogotaDateStr(date = new Date()) {
  return BOGOTA_FMT.format(date);
}

// YYYY-MM-DD of a @db.Date column value (stored at UTC midnight)
function dbDateStr(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// Date object at UTC midnight for "today" in Bogota — comparable against
// @db.Date columns in Prisma where-filters.
function bogotaToday() {
  return new Date(`${bogotaDateStr()}T00:00:00.000Z`);
}

module.exports = { bogotaDateStr, dbDateStr, bogotaToday };
