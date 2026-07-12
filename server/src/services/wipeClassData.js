// Vacía TODA la actividad de clases (sesiones, reportes en staging, asistencia,
// costos, logs, enlaces de festival/reposición y aprobaciones de liquidación)
// CONSERVANDO el catálogo: usuarios, estudiantes, grupos, profesores,
// asistentes, semestres y config. Destructivo e irreversible.
//
// Se comparte entre el script de terminal (scripts/wipe-class-data.js) y el
// endpoint del panel (routes/system.js) para que borren exactamente lo mismo.
async function wipeClassData(prisma) {
  // Orden hijo → padre para que ninguna FK bloquee el borrado.
  const steps = [
    ['Asistencia de reportes (staging)', () => prisma.classReportAttendance.deleteMany()],
    ['Reportes de clase (staging)', () => prisma.classReport.deleteMany()],
    ['Registros de asistencia consolidados', () => prisma.attendanceRecord.deleteMany()],
    ['Registros de costo', () => prisma.costRecord.deleteMany()],
    ['Logs de edición de sesión', () => prisma.sessionEditLog.deleteMany()],
    ['Profesores de festival', () => prisma.festivalProfessor.deleteMany()],
    ['Participantes de reposición/festival', () => prisma.makeupParticipant.deleteMany()],
    ['Aprobaciones de liquidación', () => prisma.payrollApproval.deleteMany()],
    ['Sesiones de clase', () => prisma.classSession.deleteMany()],
  ];

  const results = [];
  for (const [label, run] of steps) {
    const { count } = await run();
    results.push({ label, count });
  }
  return results;
}

module.exports = { wipeClassData };
