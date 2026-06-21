/**
 * Formats a date that may arrive as 'YYYY-MM-DD' or as a full ISO datetime
 * (Prisma serializes @db.Date fields as UTC midnight, e.g. "2026-06-05T00:00:00.000Z").
 * Parsing only the date part at local noon avoids both "Invalid Date" from
 * naive string concatenation and off-by-one-day shifts across timezones.
 */
export function fmtDate(d, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!d) return '';
  const parsed = new Date(String(d).slice(0, 10) + 'T12:00:00');
  if (isNaN(parsed)) return '';
  return parsed.toLocaleDateString('es-CO', options);
}
