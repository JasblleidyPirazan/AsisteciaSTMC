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
const SLOT_CAPACITY = 8;
const SLOT_UNITS = 1;
// Cuántos días hacia adelante se pueden ver y reservar turnos.
const HORIZON_DAYS = 14;
// Reservar hasta 2 h antes del turno; cancelar hasta 24 h antes.
const BOOK_CUTOFF_HOURS = 2;
const CANCEL_CUTOFF_HOURS = 24;
const SUGGESTION_MAX_LENGTH = 500;
const MAX_OPEN_SUGGESTIONS = 5;

// Reglas por defecto. La Escuela las cambia desde Configuración (SystemConfig):
// makeup_slots (JSON), makeup_capacity, makeup_horizon_days,
// makeup_book_cutoff_hours, makeup_cancel_cutoff_hours. `resolveBookingConfig`
// valida lo guardado y cae a estos valores si algo no es válido.
const DEFAULT_BOOKING_CONFIG = {
  slots: SLOT_TEMPLATES,
  capacity: SLOT_CAPACITY,
  horizonDays: HORIZON_DAYS,
  bookCutoffHours: BOOK_CUTOFF_HOURS,
  cancelCutoffHours: CANCEL_CUTOFF_HOURS,
};
const BOOKING_CONFIG_KEYS = {
  slots: 'makeup_slots',
  capacity: 'makeup_capacity',
  horizonDays: 'makeup_horizon_days',
  bookCutoffHours: 'makeup_book_cutoff_hours',
  cancelCutoffHours: 'makeup_cancel_cutoff_hours',
};
const NUMERIC_LIMITS = {
  capacity: [1, 30], horizonDays: [1, 60], bookCutoffHours: [0, 168], cancelCutoffHours: [0, 336],
};

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const AGE_LIMITS = [3, 99];

/**
 * Valida la lista de turnos. Devuelve { slots } (con `key` derivada) o { error }
 * con el motivo. Dos clases de turno:
 *   - semanal:          { weekday 0-6, start 'HH:MM', end 'HH:MM' }        → key DIA-HHMM  (VIE-1715)
 *   - fecha específica: { date 'YYYY-MM-DD', start, end }                    → key FYYYYMMDD-HHMM (F20261121-1330)
 * Ambos aceptan edades permitidas opcionales { minAge, maxAge } (años
 * cumplidos el día del turno): el acudiente solo reserva si su hijo cabe.
 */
function validateSlots(input) {
  if (!Array.isArray(input) || input.length === 0) return { error: 'Debe haber al menos un turno' };
  if (input.length > 60) return { error: 'Máximo 60 turnos' };
  const DAY = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
  const seen = new Set();
  const slots = [];
  for (const t of input) {
    if (!HM.test(String(t?.start)) || !HM.test(String(t?.end))) return { error: 'Las horas deben tener formato HH:MM' };
    if (t.start >= t.end) return { error: `El turno ${t.start} debe terminar después de empezar` };
    const slot = { start: t.start, end: t.end };
    if (t?.kind === 'date' && !t?.date) return { error: 'Falta la fecha en un turno de fecha específica' };
    if (t?.date) {
      const date = String(t.date);
      if (!YMD.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) return { error: 'Fecha inválida en un turno' };
      slot.date = date;
      slot.key = `F${date.replace(/-/g, '')}-${t.start.replace(':', '')}`;
    } else {
      const weekday = Number(t?.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: 'Día de la semana inválido en un turno' };
      slot.weekday = weekday;
      slot.key = `${DAY[weekday]}-${t.start.replace(':', '')}`;
    }
    for (const field of ['minAge', 'maxAge']) {
      const raw = t?.[field];
      if (raw === undefined || raw === null || raw === '') continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < AGE_LIMITS[0] || n > AGE_LIMITS[1]) {
        return { error: `Las edades permitidas deben ser años enteros entre ${AGE_LIMITS[0]} y ${AGE_LIMITS[1]}` };
      }
      slot[field] = n;
    }
    if (slot.minAge !== undefined && slot.maxAge !== undefined && slot.minAge > slot.maxAge) {
      return { error: `En el turno de las ${t.start} la edad mínima es mayor que la máxima` };
    }
    if (seen.has(slot.key)) return { error: `Turno repetido: ${slot.date || DAY[slot.weekday]} ${t.start}` };
    seen.add(slot.key);
    slots.push(slot);
  }
  // Semanales primero (por día y hora), luego los de fecha específica (por fecha y hora)
  slots.sort((a, b) => {
    if (!!a.date !== !!b.date) return a.date ? 1 : -1;
    if (a.date) return a.date.localeCompare(b.date) || a.start.localeCompare(b.start);
    return a.weekday - b.weekday || a.start.localeCompare(b.start);
  });
  return { slots };
}

// Lo que se guarda en SystemConfig.makeup_slots (sin la `key`, que se deriva)
function storableSlots(slots) {
  return slots.map(({ key, ...rest }) => rest);
}

/** Años cumplidos en `onDate` (YYYY-MM-DD) por quien nació en `birthDate` (Date o YYYY-MM-DD). */
function ageOn(birthDate, onDate) {
  if (!birthDate) return null;
  const b = (birthDate instanceof Date ? birthDate.toISOString() : String(birthDate)).slice(0, 10);
  if (!YMD.test(b)) return null;
  const [by, bm, bd] = b.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/**
 * ¿Puede este estudiante tomar el turno por su edad? Sin restricción → ok.
 * Con restricción y sin fecha de nacimiento → no (la Escuela debe completarla).
 * Devuelve { ok, reason }.
 */
function ageAllows(slot, birthDate) {
  if (slot.minAge === undefined && slot.maxAge === undefined) return { ok: true, reason: null };
  const age = ageOn(birthDate, slot.date);
  if (age === null) return { ok: false, reason: 'Falta la fecha de nacimiento del estudiante: comunícate con la Escuela.' };
  if ((slot.minAge !== undefined && age < slot.minAge) || (slot.maxAge !== undefined && age > slot.maxAge)) {
    return { ok: false, reason: `Este turno es para ${agesLabel(slot)}.` };
  }
  return { ok: true, reason: null };
}

// "6 a 10 años", "desde 12 años", "hasta 8 años" o null
function agesLabel(t) {
  const min = t?.minAge;
  const max = t?.maxAge;
  if (min !== undefined && min !== null && max !== undefined && max !== null) return `${min} a ${max} años`;
  if (min !== undefined && min !== null) return `desde ${min} años`;
  if (max !== undefined && max !== null) return `hasta ${max} años`;
  return null;
}

/** Une los valores guardados (filas de SystemConfig) con los de por defecto. */
function resolveBookingConfig(rows = []) {
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const cfg = { ...DEFAULT_BOOKING_CONFIG };
  if (raw[BOOKING_CONFIG_KEYS.slots]) {
    try {
      const v = validateSlots(JSON.parse(raw[BOOKING_CONFIG_KEYS.slots]));
      if (v.slots) cfg.slots = v.slots;
    } catch { /* JSON dañado: se queda el valor por defecto */ }
  }
  for (const [field, [min, max]] of Object.entries(NUMERIC_LIMITS)) {
    const n = Number(raw[BOOKING_CONFIG_KEYS[field]]);
    if (raw[BOOKING_CONFIG_KEYS[field]] !== undefined && Number.isFinite(n) && n >= min && n <= max) cfg[field] = Math.floor(n);
  }
  return cfg;
}

async function loadBookingConfig() {
  const prisma = require('../lib/prisma');
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: Object.values(BOOKING_CONFIG_KEYS) } } });
  return resolveBookingConfig(rows);
}

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

function findTemplate(key, templates = SLOT_TEMPLATES) {
  return templates.find((t) => t.key === key) || null;
}

const slotRow = (tpl, date) => ({
  date,
  key: tpl.key,
  start: tpl.start,
  end: tpl.end,
  weekday: WEEKDAY_LABEL[new Date(`${date}T00:00:00Z`).getUTCDay()],
  label: slotLabel(tpl),
  dated: !!tpl.date,
  ...(tpl.minAge !== undefined ? { minAge: tpl.minAge } : {}),
  ...(tpl.maxAge !== undefined ? { maxAge: tpl.maxAge } : {}),
  ages: agesLabel(tpl),
});

/**
 * Turnos que se ofrecen, ordenados por fecha y hora:
 *  - semanales: los de los próximos `horizonDays` días (hoy incluido), saltando
 *    las fechas excluidas del semestre (festivos, recesos);
 *  - de fecha específica: desde hoy, aunque estén más allá del horizonte o caigan
 *    en una fecha excluida (la Escuela los programó a propósito para ese día).
 */
function upcomingSlots(todayStr, excludedDates = [], horizonDays = HORIZON_DAYS, templates = SLOT_TEMPLATES) {
  const excluded = new Set(excludedDates);
  const out = [];
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(todayStr, i);
    if (excluded.has(date)) continue;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const tpl of templates) {
      if (tpl.date || tpl.weekday !== weekday) continue;
      out.push(slotRow(tpl, date));
    }
  }
  for (const tpl of templates) {
    if (tpl.date && tpl.date >= todayStr) out.push(slotRow(tpl, tpl.date));
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return out;
}

const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Turnos tal como se muestran: [{ key, day: 'Viernes' | 'Sábado 21 nov', label: '5:15 p. m. – 6:00 p. m.', minutes: 45, ages }]
// Los de fecha específica ya pasados no se describen (ya no se ofrecen).
function describeSlots(templates = SLOT_TEMPLATES, todayStr = null) {
  const mins = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  return templates
    .filter((t) => !t.date || !todayStr || t.date >= todayStr)
    .map((t) => {
      let day = WEEKDAY_LABEL[t.weekday];
      if (t.date) {
        const d = new Date(`${t.date}T00:00:00Z`);
        day = `${WEEKDAY_LABEL[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
      }
      return { key: t.key, day, date: t.date || null, label: slotLabel(t), minutes: mins(t.end) - mins(t.start), ages: agesLabel(t) };
    });
}

function hoursUntil(now, dateStr, start) {
  return (slotStartsAt(dateStr, start) - now) / 3600000;
}

function canBookAt(now, dateStr, start, cutoffHours = BOOK_CUTOFF_HOURS) {
  return hoursUntil(now, dateStr, start) >= cutoffHours;
}

function canCancelAt(now, dateStr, start, cutoffHours = CANCEL_CUTOFF_HOURS) {
  return hoursUntil(now, dateStr, start) >= cutoffHours;
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
  DEFAULT_BOOKING_CONFIG,
  BOOKING_CONFIG_KEYS,
  validateSlots,
  storableSlots,
  ageOn,
  ageAllows,
  agesLabel,
  resolveBookingConfig,
  loadBookingConfig,
  SLOT_TEMPLATES,
  SLOT_CAPACITY,
  SLOT_UNITS,
  HORIZON_DAYS,
  BOOK_CUTOFF_HOURS,
  CANCEL_CUTOFF_HOURS,
  SUGGESTION_MAX_LENGTH,
  MAX_OPEN_SUGGESTIONS,
  findTemplate,
  describeSlots,
  slotLabel,
  slotStartsAt,
  upcomingSlots,
  canBookAt,
  canCancelAt,
  bookableCount,
  newToken,
  whatsappNumber,
};
