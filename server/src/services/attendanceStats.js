// Helpers pequeños de asistencia que usan los reportes. La definición del paquete
// del estudiante (qué consume, qué da derecho a reposición, cuántas faltan) NO vive
// aquí: está en `services/studentLedger.js`.

// Las inasistencias solo cuentan a partir de la fecha de inicio de clases del
// estudiante (classesStartDate): una AUSENTE anterior no es una falta real — el
// estudiante aún no empezaba clases — así que no suma faltas ni entra al
// denominador de asistencia. Sin fecha de inicio (o sin fecha de sesión) la falta
// cuenta normal.
function absenceCounts(sessionDate, classesStartDate) {
  if (!classesStartDate || !sessionDate) return true;
  return new Date(sessionDate).getTime() >= new Date(classesStartDate).getTime();
}

// ─── Reposiciones sencillas y dobles ──────────────────────────────────────
// Una reposición grupal se programa declarando "por cuántas asistencias cuenta"
// (ClassSession.effectiveUnits): sencilla = 1, doble = 2. Ese valor es la única
// fuente de verdad de cuántas clases del paquete vale la sesión. Las clases
// regulares y los festivales siempre valen 1.0, así que multiplicar por las
// unidades es seguro en cualquier sesión.
function attendanceUnits(session) {
  const units = parseFloat(session?.effectiveUnits);
  return Number.isFinite(units) && units > 0 ? units : 1;
}

// Clases CONSUMIDAS del paquete por UN registro: PRESENTE (clase, reposición o
// festival) y AUSENTE desde el inicio de clases (la falta gasta la clase);
// JUSTIFICADA y N/A no consumen. Vale las unidades de la sesión.
function consumedUnits(record, session, classesStartDate) {
  if (record?.status === 'PRESENTE') return attendanceUnits(session);
  if (record?.status === 'AUSENTE' && absenceCounts(session?.date, classesStartDate)) return attendanceUnits(session);
  return 0;
}

// Las unidades admiten medios (0.5), así que los acumulados se redondean a un
// decimal para no arrastrar ruido de punto flotante.
function roundUnits(total) {
  return Math.round((total + Number.EPSILON) * 10) / 10;
}

module.exports = { absenceCounts, attendanceUnits, consumedUnits, roundUnits };
