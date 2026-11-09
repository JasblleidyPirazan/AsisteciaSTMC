// Ampliar el semestre: correr su fecha de fin (`Semester.endDate`) más adelante.
//
// La fecha de fin no decide qué clases cuentan para el semestre (eso es la
// ventana D4: desde su inicio hasta el inicio del siguiente semestre), pero sí
// todo lo que se proyecta "hasta el cierre": cuántas clases regulares le quedan
// a cada estudiante (`pendientes.restantesEnSemestre`), el déficit, si la fecha
// estimada de fin "excede el semestre", el tope de las suspensiones y el cierre
// del correo semanal. Ampliar lo recalcula todo solo, porque todo lee la fecha
// de la base.
//
// Reglas (lógica pura, unit-testeada en tests/unit/semesterExtension.test.js):
//   - la nueva fecha es válida (YYYY-MM-DD) y posterior a la fecha de fin actual
//   - no llega al inicio del semestre siguiente (si lo hay): las clases de esos
//     días ya contarían para el otro semestre y las cifras dejarían de cuadrar
//   - no más de 120 días de ampliación (evita errores de digitación)

const MAX_EXTENSION_DAYS = 120;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const ymd = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

/** El semestre que empieza justo después de `semester` (o null). */
function nextSemester(semester, allSemesters = []) {
  const start = ymd(semester.startDate);
  return allSemesters
    .filter((s) => s.id !== semester.id && ymd(s.startDate) > start)
    .sort((a, b) => ymd(a.startDate).localeCompare(ymd(b.startDate)))[0] || null;
}

/**
 * ¿Se puede ampliar `semester` hasta `newEnd`?
 * Devuelve { error } o { from, to, days, next } (from = fin actual, to = nueva).
 */
function validateExtension({ semester, allSemesters = [], newEnd }) {
  const to = String(newEnd || '').trim();
  if (!YMD.test(to) || Number.isNaN(new Date(`${to}T00:00:00Z`).getTime())) {
    return { error: 'La nueva fecha de fin no es válida' };
  }
  const from = ymd(semester.endDate);
  if (to <= from) return { error: `La nueva fecha debe ser posterior al fin actual (${from})` };
  const days = daysBetween(from, to);
  if (days > MAX_EXTENSION_DAYS) return { error: `No se puede ampliar más de ${MAX_EXTENSION_DAYS} días de una vez` };
  const next = nextSemester(semester, allSemesters);
  if (next && to >= ymd(next.startDate)) {
    return { error: `El semestre "${next.name}" empieza el ${ymd(next.startDate)}: el fin debe ser anterior a esa fecha` };
  }
  return { from, to, days, next: next ? { id: next.id, name: next.name, startDate: ymd(next.startDate) } : null };
}

/**
 * Fechas de inicio y fin de un semestre (crear o editar): el fin después del
 * inicio y, si hay un semestre siguiente, antes de que empiece. { error } o {}.
 */
function validateSemesterDates({ semester, allSemesters = [] }) {
  const start = ymd(semester.startDate);
  const end = ymd(semester.endDate);
  if (!YMD.test(start) || !YMD.test(end)) return { error: 'Fechas inválidas' };
  if (end < start) return { error: 'La fecha de fin debe ser posterior a la de inicio' };
  const next = nextSemester(semester, allSemesters);
  if (next && end >= ymd(next.startDate)) {
    return { error: `El semestre "${next.name}" empieza el ${ymd(next.startDate)}: el fin debe ser anterior a esa fecha` };
  }
  return {};
}

module.exports = { validateExtension, validateSemesterDates, nextSemester, MAX_EXTENSION_DAYS };
