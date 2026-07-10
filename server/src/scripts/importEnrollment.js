/**
 * Importador de matrícula desde el Excel de preinscripción (línea de comandos).
 *
 * Uso:
 *   node src/scripts/importEnrollment.js [ruta.xlsx] [--dry-run]
 *
 * Si no se pasa ruta, usa server/data/matricula.xlsx. Hace UPSERT (actualiza lo
 * existente por documento, agrega lo nuevo) y NO borra estudiantes faltantes.
 *
 * La lógica vive en src/services/enrollmentImport.js (compartida con el
 * endpoint del admin POST /students/import).
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');
const { importFromBuffer } = require('../services/enrollmentImport');

const DRY = process.argv.includes('--dry-run');
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const FILE = path.resolve(fileArg || path.join(__dirname, '../../data/matricula.xlsx'));

async function run() {
  console.log(`📄 Archivo: ${FILE}`);
  console.log(DRY ? '🔎 MODO DRY-RUN (no escribe en la base de datos)\n' : '💾 Escribiendo en la base de datos\n');

  const buffer = fs.readFileSync(FILE);
  const s = await importFromBuffer(buffer, { dryRun: DRY });

  console.log(`Registros con nombre: ${s.counts.records}`);
  console.log(`Estudiantes únicos: ${s.counts.students}`);
  console.log(`Grupos únicos: ${s.counts.groups}`);
  console.log(`Profesores únicos: ${s.counts.professors} (${s.professors.join(', ')})`);
  console.log(`Estudiantes con más de un grupo: ${s.counts.multiGroup}`);

  if (s.dryRun) {
    console.log('\n--- Muestra de grupos ---');
    s.samples.groups.forEach((g) => console.log(g.code, '→', JSON.stringify(g)));
    console.log('\n--- Muestra de estudiantes ---');
    s.samples.students.forEach((st) => console.log(JSON.stringify(st)));
    console.log('\n✅ Dry-run completo. Sin cambios en la base.');
    return;
  }

  if (s.warnings && s.warnings.length) {
    console.log('\n⚠ Avisos:');
    s.warnings.forEach((w) => console.log('  -', w));
  }
  console.log(`\n✔ Estudiantes: ${s.result.created} creados, ${s.result.updated} actualizados, ${s.result.moved} cambios de grupo principal`);
  console.log('✅ Importación completa.');
}

run()
  .catch((err) => { console.error('❌ Error:', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
