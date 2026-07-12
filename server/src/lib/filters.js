const { bogotaToday } = require('./dates');

// Prisma where-fragment: student is NOT under an active suspension today.
// Suspension visibility is resolved per-query so students reappear
// automatically when the range ends — no cron needed.
//
// Debe ser null-safe: un estudiante sin suspensión tiene suspendedFrom/Until
// en NULL. La forma `NOT (from <= hoy AND until >= hoy)` los EXCLUÍA, porque en
// SQL `NULL <= hoy` es NULL y `NOT NULL` es NULL → la fila no pasa el WHERE, y
// el roster quedaba vacío. La negación explícita por De Morgan cubre los NULL:
// NO está suspendido si falta cualquiera de las fechas, o la suspensión ya
// terminó, o aún no empieza. Solo se excluye a quien esté suspendido hoy
// (ambas fechas presentes y el día dentro del rango).
function notSuspended(today = bogotaToday()) {
  return {
    OR: [
      { suspendedFrom: null },
      { suspendedUntil: null },
      { suspendedFrom: { gt: today } },
      { suspendedUntil: { lt: today } },
    ],
  };
}

module.exports = { notSuspended };
