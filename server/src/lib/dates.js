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

// Día de la semana (0=Dom … 6=Sáb) del día actual EN BOGOTÁ. El servidor corre
// en UTC: después de las 7 p. m. de Bogotá, new Date().getDay() ya es "mañana".
function bogotaDayOfWeek() {
  return bogotaToday().getUTCDay();
}

// Minutos transcurridos del día actual en Bogotá (para comparar contra
// horarios "HH:MM" de los grupos).
const BOGOTA_HM_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false,
});
function bogotaMinutesOfDay(date = new Date()) {
  const hm = BOGOTA_HM_FMT.format(date);
  return Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
}

module.exports = { bogotaDateStr, dbDateStr, bogotaToday, bogotaDayOfWeek, bogotaMinutesOfDay };
