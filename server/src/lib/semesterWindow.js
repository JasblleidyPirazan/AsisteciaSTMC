// Ventana de un semestre (regla D4 de "Reglas de negocio del paquete").
//
// Una clase o reposición cuenta para el semestre si su fecha está en
//   [semester.startDate, siguienteSemestre.startDate)
// Si no hay semestre posterior no hay límite superior (`to: null`): una clase
// dictada después de `endDate` y antes de que empiece el siguiente semestre
// sigue siendo del semestre actual. `Semester.endDate` NO es el límite: se usa
// solo para proyecciones ("¿alcanza antes del cierre?").
//
// Las fechas son @db.Date (UTC medianoche); se comparan como YYYY-MM-DD.
const { dbDateStr } = require('./dates');

/**
 * @param {{ id?: string, startDate: Date|string }} semester   semestre del que se pide la ventana
 * @param {Array<{ id?: string, startDate: Date|string }>} [allSemesters]  todos los semestres (incluye o no a `semester`)
 * @returns {{ from: string, to: string|null }}  `to` es exclusivo
 */
function semesterWindow(semester, allSemesters = []) {
  const from = dbDateStr(semester.startDate);
  let to = null;
  for (const other of allSemesters || []) {
    if (!other?.startDate) continue;
    const start = dbDateStr(other.startDate);
    if (start > from && (to === null || start < to)) to = start; // el inicio posterior más cercano
  }
  return { from, to };
}

// ¿La fecha (YYYY-MM-DD, Date o @db.Date) cae dentro de la ventana?
function inWindow(window, date) {
  const d = typeof date === 'string' ? date.slice(0, 10) : dbDateStr(date);
  return window.from <= d && (window.to === null || d < window.to);
}

module.exports = { semesterWindow, inWindow };
