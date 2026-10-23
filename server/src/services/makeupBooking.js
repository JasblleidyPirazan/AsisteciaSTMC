// Agendamiento público de reposiciones (/reponer/:token).
//
// El acudiente abre su enlace personal (sin login), ve cuántas clases tiene por
// reponer y reserva turnos de 45 minutos en la cancha de reposiciones. Cada
// turno con al menos una reserva es una reposición grupal normal del sistema
// (ClassSession kind=MAKEUP + MakeupParticipant), así que de ahí en adelante
// sigue el flujo de siempre: el coordinador asigna profesor, se reporta la
// asistencia, corre el motor de costos y baja la deuda del estudiante.
//
// Aquí vive la lógica pura (turnos, ventanas de reserva/cancelación, cupo
// disponible), unit-testeada en tests/unit/makeupBooking.test.js.
const crypto = require('crypto');

// Turnos fijos de la semana. weekday: 0=Dom … 6=Sáb. Un turno vale por una
// clase regular (effectiveUnits = 1). Todos los niveles comparten turno.
const SLOT_TEMPLATES = [
  { key: 'VIE-1715', weekday: 5, start: '17:15', end: '18:00' },
  { key: 'VIE-1800', weekday: 5, start: '18:00', end: '18:45' },
  { key: 'SAB-1330', weekday: 6, start: '13:30', end: '14:15' },
  { key: 'SAB-1415', weekday: 6, start: '14:15', end: '15:00' },
];
const SLOT_CAPACITY = 6;
const SLOT_UNITS = 1;
// Cuántos días hacia adelante se pueden ver y reservar turnos.
const HORIZON_DAYS = 14;
// Reservar hasta 2 h antes del turno; cancelar hasta 24 h antes.
const BOOK_CUTOFF_HOURS = 2;
const CANCEL_CUTOFF_HOURS = 24;
const SUGGESTION_MAX_LENGTH = 500;
const MAX_OPEN_SUGGESTIONS = 5;

const WEEKDAY_LABEL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "17:15" → "5:15 p. m."
function fmtTime(hm) {
  const [h, m] = hm.split(':').map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

function slotLabel(tpl) {
  return `${fmtTime(tpl.start)} – ${fmtTime(tpl.end)}`;
}

// Instante en que arranca un turno. Bogotá es UTC−5 todo el año (sin horario de verano).
function slotStartsAt(dateStr, start) {
  return new Date(`${dateStr}T${start}:00-05:00`);
}

function findTemplate(key) {
  return SLOT_TEMPLATES.find((t) => t.key === key) || null;
}

/**
 * Turnos de los próximos `horizonDays` días (hoy incluido), saltando las fechas
 * excluidas del semestre (festivos, recesos). Ordenados por fecha y hora.
 */
function upcomingSlots(todayStr, excludedDates = [], horizonDays = HORIZON_DAYS) {
  const excluded = new Set(excludedDates);
  const out = [];
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(todayStr, i);
    if (excluded.has(date)) continue;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const tpl of SLOT_TEMPLATES) {
      if (tpl.weekday !== weekday) continue;
      out.push({
        date,
        key: tpl.key,
        start: tpl.start,
        end: tpl.end,
        weekday: WEEKDAY_LABEL[weekday],
        label: slotLabel(tpl),
      });
    }
  }
  return out;
}

function hoursUntil(now, dateStr, start) {
  return (slotStartsAt(dateStr, start) - now) / 3600000;
}

function canBookAt(now, dateStr, start) {
  return hoursUntil(now, dateStr, start) >= BOOK_CUTOFF_HOURS;
}

function canCancelAt(now, dateStr, start) {
  return hoursUntil(now, dateStr, start) >= CANCEL_CUTOFF_HOURS;
}

/**
 * Cuántos turnos más puede reservar: lo que debe reponer menos lo que ya tiene
 * agendado (reposiciones programadas aún sin reportar). Nunca negativo.
 */
function bookableCount(pending, reservedUnits) {
  return Math.max(0, Math.floor((Number(pending) || 0) - (Number(reservedUnits) || 0)));
}

function newToken() {
  return crypto.randomBytes(18).toString('base64url');
}

// Número para wa.me: solo dígitos; un celular colombiano de 10 dígitos lleva el 57.
function whatsappNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}

module.exports = {
  SLOT_TEMPLATES,
  SLOT_CAPACITY,
  SLOT_UNITS,
  HORIZON_DAYS,
  BOOK_CUTOFF_HOURS,
  CANCEL_CUTOFF_HOURS,
  SUGGESTION_MAX_LENGTH,
  MAX_OPEN_SUGGESTIONS,
  findTemplate,
  slotLabel,
  slotStartsAt,
  upcomingSlots,
  canBookAt,
  canCancelAt,
  bookableCount,
  newToken,
  whatsappNumber,
};
