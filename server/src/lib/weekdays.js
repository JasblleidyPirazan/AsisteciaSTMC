// Días de la semana que toma un estudiante en un grupo (StudentEnrollment.weekdays).
//
// Convención: números de getUTCDay(): 0 = domingo … 6 = sábado.
// `null` (o lista vacía en base de datos: Prisma no distingue NULL de {} en
// listas) significa "todos los días del grupo".

const DAY_FIELDS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Letras de la importación: L lunes · M martes · X miércoles · J jueves · V viernes · S sábado · D domingo
const LETTER_TO_DAY = { L: 1, M: 2, X: 3, J: 4, V: 5, S: 6, D: 0 };

// Días (0–6, ordenados) en que el grupo tiene clase.
function groupWeekdays(group) {
  return DAY_FIELDS.map((field, i) => (group?.[field] ? i : null)).filter((d) => d != null);
}

// Valor almacenado → null (todos) o lista ordenada. Lo vacío cuenta como "todos".
function storedWeekdays(value) {
  return Array.isArray(value) && value.length > 0 ? [...value].sort((a, b) => a - b) : null;
}

/**
 * Valida y normaliza los días que llegan por la API para un grupo.
 *  - undefined / null           → { value: null }  (todos los días del grupo)
 *  - lista con todos sus días   → { value: null }  (equivale a "todos")
 *  - lista de días del grupo    → { value: [..ordenada, sin repetidos..] }
 *  - cualquier otra cosa        → { error }
 */
function normalizeWeekdays(input, group) {
  if (input === undefined || input === null) return { value: null };
  if (!Array.isArray(input)) return { error: 'Los días deben ser una lista de números de 0 (domingo) a 6 (sábado)' };
  const days = [];
  for (const raw of input) {
    const d = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      return { error: `Día inválido (${JSON.stringify(raw)}): usa números de 0 (domingo) a 6 (sábado)` };
    }
    if (!days.includes(d)) days.push(d);
  }
  if (days.length === 0) return { error: 'Selecciona al menos un día de clase' };
  days.sort((a, b) => a - b);

  const available = groupWeekdays(group);
  const outside = days.filter((d) => !available.includes(d));
  if (outside.length > 0) {
    const code = group?.code ? ` ${group.code}` : '';
    const names = outside.map((d) => DAY_NAMES[d]).join(', ');
    return { error: `El grupo${code} no tiene clase el ${names}` };
  }
  if (days.length === available.length) return { value: null };
  return { value: days };
}

/**
 * Interpreta la columna "Días" del Excel de estudiantes: "L,X,V", "L-X-V",
 * "L X V" o pegado "LXV". Vacío → { days: null }. Letras desconocidas se
 * devuelven en `invalid` para avisar sin romper la importación.
 */
function parseDayLetters(text) {
  const raw = String(text == null ? '' : text).trim().toUpperCase();
  if (!raw) return { days: null, invalid: [] };
  let tokens = raw.split(/[\s,;/\-–]+/).filter(Boolean);
  // "LXV" pegado: se separa letra por letra si todas son letras de día
  tokens = tokens.flatMap((t) => (t.length > 1 && [...t].every((c) => c in LETTER_TO_DAY) ? [...t] : [t]));
  const days = [];
  const invalid = [];
  for (const t of tokens) {
    if (t in LETTER_TO_DAY) {
      if (!days.includes(LETTER_TO_DAY[t])) days.push(LETTER_TO_DAY[t]);
    } else invalid.push(t);
  }
  days.sort((a, b) => a - b);
  return { days: days.length ? days : null, invalid };
}

module.exports = { DAY_FIELDS, DAY_NAMES, LETTER_TO_DAY, groupWeekdays, storedWeekdays, normalizeWeekdays, parseDayLetters };
