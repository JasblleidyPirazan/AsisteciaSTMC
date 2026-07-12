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
const { wipeClassData } = require('../services/wipeClassData');

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

  const results = await wipeClassData(prisma);
  for (const { label, count } of results) {
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
