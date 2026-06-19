// Utilidades de dominio para grupos.

const DAY_FIELDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Convierte un arreglo de índices (0=Lunes ... 6=Domingo) a flags booleanos por día.
export function dayFlagsFromIndices(indices) {
  const set = new Set(indices);
  return DAY_FIELDS.reduce((acc, field, i) => {
    acc[field] = set.has(i);
    return acc;
  }, {});
}

// Día de la semana de una fecha en índice 0=Lunes ... 6=Domingo.
export function weekdayIndex(date) {
  const js = new Date(date).getUTCDay(); // 0=Domingo ... 6=Sábado
  return (js + 6) % 7;
}

// ¿El grupo tiene clase en la fecha dada?
export function groupRunsOn(group, date) {
  const field = DAY_FIELDS[weekdayIndex(date)];
  return Boolean(group[field]);
}

// Minutos entre dos horas "HH:MM".
export function durationMinutes(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

// Unidades de clase a partir de la duración: 90 min -> 2.0 (doble), si no 1.0.
export function classUnitsFromDuration(minutes) {
  return minutes >= 90 ? 2.0 : 1.0;
}

// Genera un código legible: DIAS-HORA-PROFESOR-NIVEL (ej: LM-15:45-Brayan-Verde).
export function buildGroupCode({ dayIndices, startTime, professorName, ballLevel }) {
  const dayInitials = dayIndices
    .map((i) => DAY_LABELS[i]?.[0] ?? '')
    .join('');
  const prof = (professorName ?? '').split(' ')[0] || 'Prof';
  const level = ballLevel.charAt(0) + ballLevel.slice(1).toLowerCase();
  return `${dayInitials}-${startTime}-${prof}-${level}`;
}

export { DAY_FIELDS, DAY_LABELS };
