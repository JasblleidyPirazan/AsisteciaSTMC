/**
 * Diagnóstico: ¿por qué una reposición grupal no le aparece a su profesor en
 * el home? Solo LEE la base de datos — no modifica nada.
 *
 *   node src/scripts/diagnose-makeups.js            # reposiciones de hoy (Bogotá)
 *   node src/scripts/diagnose-makeups.js 2026-09-04 # de una fecha concreta
 *   node src/scripts/diagnose-makeups.js --all      # todas las PROGRAMADA
 *
 * El home del profesor pide GET /makeups?status=PROGRAMADA y el servidor filtra
 * por `makeupProfessorId` o `substituteProfessorId` = el Professor **vinculado a
 * su cuenta de usuario**. Si cualquiera de esas tres cosas falla, la reposición
 * no aparece. Este script revisa las tres.
 */
const prisma = require('../lib/prisma');
const { bogotaDateStr, dbDateStr } = require('../lib/dates');

const OK = '✅';
const BAD = '❌';

async function main() {
  const arg = process.argv[2];
  const all = arg === '--all';
  const date = all ? null : (arg || bogotaDateStr());

  console.log('\n════════ Diagnóstico de reposiciones grupales ════════');
  console.log(all ? 'Alcance: todas las PROGRAMADA' : `Fecha: ${date} (hora de Bogotá)`);

  const makeups = await prisma.classSession.findMany({
    where: { kind: 'MAKEUP', ...(date ? { date: new Date(date) } : {}) },
    include: {
      makeupProfessor: { include: { user: { select: { id: true, email: true, role: true, active: true } } } },
      substituteProfessor: { include: { user: { select: { id: true, email: true, role: true, active: true } } } },
      assistant: { select: { id: true, name: true } },
      makeupParticipants: { select: { studentId: true } },
    },
    orderBy: { date: 'desc' },
  });

  if (makeups.length === 0) {
    console.log(`\n${BAD} No existe NINGUNA reposición grupal con esa fecha.`);
    console.log('   → O no se creó, o se guardó con otra fecha. Reposiciones más recientes:');
    const recent = await prisma.classSession.findMany({
      where: { kind: 'MAKEUP' },
      select: { id: true, title: true, date: true, status: true },
      orderBy: { date: 'desc' }, take: 5,
    });
    for (const m of recent) {
      console.log(`     · ${dbDateStr(m.date)}  ${m.status.padEnd(11)}  ${m.title || 'Reposición grupal'}`);
    }
    if (recent.length === 0) console.log('     (no hay ninguna reposición en el sistema)');
    return;
  }

  for (const m of makeups) {
    console.log(`\n── ${m.title || 'Reposición grupal'} · ${dbDateStr(m.date)} ──`);
    console.log(`   id: ${m.id}`);
    console.log(`   estudiantes asignados: ${m.makeupParticipants.length}`);
    console.log(`   cuenta por: ${parseFloat(m.effectiveUnits)} asistencia(s)`);

    // 1) El estado debe ser PROGRAMADA: el home solo pide esas.
    const programada = m.status === 'PROGRAMADA';
    console.log(`   ${programada ? OK : BAD} estado: ${m.status}` +
      (programada ? '' : '  ← el home solo muestra las PROGRAMADA (esta ya fue reportada o cancelada)'));

    // 2) Debe haber un profesor asignado.
    const prof = m.substituteProfessor || m.makeupProfessor;
    if (!prof) {
      console.log(`   ${BAD} profesor: SIN ASIGNAR  ← nadie la puede ver ni reportar`);
      continue;
    }
    console.log(`   ${OK} profesor: ${prof.name}` +
      (m.substituteProfessor ? ` (sustituto; titular: ${m.makeupProfessor?.name || '—'})` : ''));
    console.log(`      profesor activo: ${prof.active ? OK : BAD + ' INACTIVO'}`);

    // 3) Ese profesor debe tener CUENTA DE USUARIO vinculada: el filtro del
    //    servidor va de req.user.id → Professor.userId → makeupProfessorId.
    if (!prof.user) {
      console.log(`   ${BAD} el profesor NO tiene cuenta de acceso vinculada (Professor.userId vacío)`);
      console.log('      → aunque entre con un usuario TEACHER, el servidor no lo reconoce como');
      console.log('        este profesor y le devuelve CERO reposiciones.');
      console.log('      → arreglo: /admin/profesores → editar → asignarle correo y contraseña.');
      continue;
    }
    const u = prof.user;
    const rolOk = u.role === 'TEACHER' || u.role === 'SUPERADMIN';
    console.log(`   ${OK} cuenta vinculada: ${u.email}`);
    console.log(`      ${u.active ? OK : BAD} cuenta activa: ${u.active}`);
    console.log(`      ${rolOk ? OK : BAD} rol: ${u.role}` + (rolOk ? '' : '  ← con este rol el home no filtra por profesor'));

    if (programada && prof.user && u.active) {
      console.log(`   → Esta reposición SÍ debería aparecerle a ${u.email} en su home.`);
    }
  }

  // Profesores sin cuenta vinculada: la causa silenciosa más común.
  const huerfanos = await prisma.professor.findMany({
    where: { active: true, userId: null },
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  if (huerfanos.length > 0) {
    console.log(`\n⚠️  Profesores activos SIN cuenta de acceso vinculada (${huerfanos.length}):`);
    for (const p of huerfanos) console.log(`     · ${p.name}`);
    console.log('   A ninguno de ellos le aparecerán reposiciones, aunque estén asignadas.');
  }
  console.log('');
}

main()
  .catch((err) => { console.error('Error:', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
