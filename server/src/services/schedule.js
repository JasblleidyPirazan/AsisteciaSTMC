const { dbDateStr } = require('../lib/dates');

// Group day-flags indexed by JS getUTCDay() (0 = Sunday)
const DAY_FIELDS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/**
 * Expected class dates for a group inside the active semester.
 *
 * Walks the calendar from the semester start (or `floor`, whichever is later —
 * e.g. the student's enrollment date or the group's creation date) up to
 * `until` (or the semester end, whichever is earlier), keeping the dates whose
 * weekday matches the group's schedule and that are not semester exclusions.
 *
 * All boundaries are @db.Date values (UTC midnight). Returns YYYY-MM-DD strings.
 */
function expectedDatesForGroup(group, semester, exclusions = [], until = new Date(), floor = null) {
  if (!semester) return [];

  const excluded = new Set(exclusions.map((e) => dbDateStr(e.date)));

  let startStr = dbDateStr(semester.startDate);
  if (floor) {
    const floorStr = dbDateStr(floor);
    if (floorStr > startStr) startStr = floorStr;
  }
  let endStr = dbDateStr(semester.endDate);
  const untilStr = dbDateStr(until);
  if (untilStr < endStr) endStr = untilStr;
  if (startStr > endStr) return [];

  const dates = [];
  const cursor = new Date(`${startStr}T00:00:00.000Z`);
  const end = new Date(`${endStr}T00:00:00.000Z`);
  while (cursor <= end) {
    const dayField = DAY_FIELDS[cursor.getUTCDay()];
    const dateStr = cursor.toISOString().slice(0, 10);
    if (group[dayField] && !excluded.has(dateStr)) dates.push(dateStr);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

module.exports = { expectedDatesForGroup };
