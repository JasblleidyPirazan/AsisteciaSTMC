// One-off cleanup for the fresh start of a semester: empties all CLASS activity
// (sessions, both staging reports, attendance, costs, logs, festival/makeup
// links and payroll approvals) while PRESERVING the catalog: users, students,
// groups, professors, assistants, semesters and system config.
//
// Destructive and irreversible. Requires an explicit confirmation:
//     CONFIRM_WIPE=YES node src/scripts/wipe-class-data.js
//   or
//     node src/scripts/wipe-class-data.js --yes
//
// Take a backup first (see "Backups de BD" in CLAUDE.md).
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const confirmed = process.env.CONFIRM_WIPE === 'YES' || process.argv.includes('--yes');
  if (!confirmed) {
    console.error(
      'Abortado: este script borra TODOS los datos de clases.\n' +
        'Para confirmar: CONFIRM_WIPE=YES node src/scripts/wipe-class-data.js'
    );
    process.exit(1);
  }

  // Child → parent order so foreign keys never block a delete (independent of
  // whether the relation cascades).
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

  for (const [label, run] of steps) {
    const { count } = await run();
    console.log(`  ✓ ${label}: ${count} borrados`);
  }
  console.log('Limpieza de datos de clases completada. Catálogo (usuarios, estudiantes, grupos, semestres, config) intacto.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
