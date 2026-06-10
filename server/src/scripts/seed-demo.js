/**
 * seed-demo.js — Datos de demostración para pruebas
 *
 * Ejecutar desde la carpeta /server:
 *   node src/scripts/seed-demo.js
 *
 * Es idempotente: se puede correr varias veces sin duplicar datos.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { calculateCosts } = require('../services/costEngine');

const prisma = new PrismaClient();

// ─── helpers ──────────────────────────────────────────────────────────────────

const d = (dateStr) => new Date(dateStr + 'T12:00:00.000Z');

async function upsertUser(email, password, role) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: await bcrypt.hash(password, 10), role },
  });
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎾  Creando datos de demostración STMC...\n');

  // ── Usuarios ──────────────────────────────────────────────────────────────
  const [uBrayan, uCarlos, uMaria, uFelipe, uPadre1, uPadre2] = await Promise.all([
    upsertUser('brayan@stmc.com',  'brayan123',  'TEACHER'),
    upsertUser('carlos@stmc.com',  'carlos123',  'TEACHER'),
    upsertUser('maria@stmc.com',   'maria123',   'ASSISTANT'),
    upsertUser('felipe@stmc.com',  'felipe123',  'PHYSICAL_TRAINER'),
    upsertUser('padre1@stmc.com',  'padre123',   'PARENT'),
    upsertUser('padre2@stmc.com',  'padre123',   'PARENT'),
  ]);
  console.log('✅ Usuarios creados');

  // ── Profesores ────────────────────────────────────────────────────────────
  const [prof1, prof2] = await Promise.all([
    prisma.professor.upsert({
      where: { userId: uBrayan.id },
      update: {},
      create: { name: 'Brayan García', userId: uBrayan.id },
    }),
    prisma.professor.upsert({
      where: { userId: uCarlos.id },
      update: {},
      create: { name: 'Carlos Pérez', userId: uCarlos.id },
    }),
  ]);
  console.log('✅ Profesores creados');

  // ── Asistente ─────────────────────────────────────────────────────────────
  const asst = await prisma.assistant.upsert({
    where: { userId: uMaria.id },
    update: {},
    create: { name: 'María López', userId: uMaria.id },
  });
  console.log('✅ Asistente creada');

  // ── Grupos ────────────────────────────────────────────────────────────────
  const [g1, g2, g3] = await Promise.all([
    prisma.group.upsert({
      where: { code: 'LM-15:45-Brayan-Verde' },
      update: {},
      create: {
        code: 'LM-15:45-Brayan-Verde',
        professorId: prof1.id,
        lunes: true, miercoles: true,
        startTime: '15:45', endTime: '16:30',
        durationMinutes: 45, classUnits: 1.0,
        court: 1, ballLevel: 'Verde',
      },
    }),
    prisma.group.upsert({
      where: { code: 'JV-16:00-Carlos-Naranja' },
      update: {},
      create: {
        code: 'JV-16:00-Carlos-Naranja',
        professorId: prof2.id,
        jueves: true, viernes: true,
        startTime: '16:00', endTime: '17:30',
        durationMinutes: 90, classUnits: 2.0,
        court: 2, ballLevel: 'Naranja',
      },
    }),
    prisma.group.upsert({
      where: { code: 'S-10:00-Brayan-Roja' },
      update: {},
      create: {
        code: 'S-10:00-Brayan-Roja',
        professorId: prof1.id,
        sabado: true,
        startTime: '10:00', endTime: '10:45',
        durationMinutes: 45, classUnits: 1.0,
        court: 3, ballLevel: 'Roja',
      },
    }),
  ]);
  console.log('✅ Grupos creados');

  // ── Estudiantes ───────────────────────────────────────────────────────────
  // Helper: find-or-create student (no unique constraint on name)
  async function getOrCreateStudent({ name, email, parentUserId, groupId }) {
    let student = await prisma.student.findFirst({ where: { name } });
    if (!student) {
      student = await prisma.student.create({
        data: {
          name,
          email: email || null,
          parentUserId: parentUserId || null,
          enrollments: { create: [{ groupId, enrollmentType: 'PRIMARY' }] },
        },
      });
    }
    return student;
  }

  const [sofía, valentina, juan, camila, sebastián,
         andrés, mariana, felipe, isabella,
         tomás, lucía, emilio] = await Promise.all([
    // Grupo Verde (g1) — 5 estudiantes
    getOrCreateStudent({ name: 'Sofía Rodríguez',   email: 'sofia.r@gmail.com', parentUserId: uPadre1.id, groupId: g1.id }),
    getOrCreateStudent({ name: 'Valentina Martínez', email: null,               parentUserId: uPadre2.id, groupId: g1.id }),
    getOrCreateStudent({ name: 'Juan Pérez',         email: null,               parentUserId: null,       groupId: g1.id }),
    getOrCreateStudent({ name: 'Camila López',       email: null,               parentUserId: null,       groupId: g1.id }),
    getOrCreateStudent({ name: 'Sebastián Torres',   email: null,               parentUserId: null,       groupId: g1.id }),
    // Grupo Naranja (g2) — 4 estudiantes
    getOrCreateStudent({ name: 'Andrés Ruiz',        email: null,               parentUserId: uPadre1.id, groupId: g2.id }),
    getOrCreateStudent({ name: 'Mariana Castro',     email: null,               parentUserId: null,       groupId: g2.id }),
    getOrCreateStudent({ name: 'Felipe Ortega',      email: null,               parentUserId: null,       groupId: g2.id }),
    getOrCreateStudent({ name: 'Isabella Vargas',    email: null,               parentUserId: null,       groupId: g2.id }),
    // Grupo Roja (g3) — 3 estudiantes
    getOrCreateStudent({ name: 'Tomás Estrada',      email: null,               parentUserId: uPadre2.id, groupId: g3.id }),
    getOrCreateStudent({ name: 'Lucía Fernández',    email: null,               parentUserId: null,       groupId: g3.id }),
    getOrCreateStudent({ name: 'Emilio Nieto',       email: null,               parentUserId: null,       groupId: g3.id }),
  ]);
  console.log('✅ Estudiantes creados (12)');

  // ── Sesiones + asistencia + costos ────────────────────────────────────────
  /**
   * present/absent/justified: arrays de Student objects
   * cancelledHalf: solo para grupos dobles (g2) — efectúa CANCELADA_MITAD
   */
  const sessionDefs = [
    // ── Grupo Verde / Brayan ──────────────────────────────────────────────
    {
      groupId: g1.id, date: '2026-05-25', status: 'REALIZADA', units: 1.0,
      present: [sofía, valentina, juan, camila], absent: [sebastián],
    },
    {
      groupId: g1.id, date: '2026-05-27', status: 'REALIZADA', units: 1.0,
      present: [sofía, juan, camila, sebastián], absent: [valentina],
    },
    {
      groupId: g1.id, date: '2026-06-02', status: 'REALIZADA', units: 1.0,
      present: [sofía, valentina, juan, camila, sebastián], absent: [],
    },
    {
      groupId: g1.id, date: '2026-06-04', status: 'CANCELADA', units: 1.0,
      present: [], absent: [], reason: 'Lluvia intensa',
    },
    {
      groupId: g1.id, date: '2026-06-09', status: 'REALIZADA', units: 1.0,
      present: [sofía, valentina, camila], absent: [juan, sebastián],
    },
    // ── Grupo Naranja / Carlos ────────────────────────────────────────────
    {
      groupId: g2.id, date: '2026-05-28', status: 'REALIZADA', units: 2.0,
      present: [andrés, mariana, felipe, isabella], absent: [],
    },
    {
      groupId: g2.id, date: '2026-05-29', status: 'CANCELADA_MITAD', units: 1.0,
      present: [andrés, mariana, felipe], absent: [isabella], reason: 'Lluvia a la mitad',
    },
    {
      groupId: g2.id, date: '2026-06-05', status: 'REALIZADA', units: 2.0,
      present: [andrés, felipe, isabella], absent: [mariana],
    },
    {
      groupId: g2.id, date: '2026-06-06', status: 'REALIZADA', units: 2.0,
      present: [andrés, mariana, felipe, isabella], absent: [],
      assistantId: asst.id,
    },
    // ── Grupo Roja / Brayan ───────────────────────────────────────────────
    {
      groupId: g3.id, date: '2026-05-30', status: 'REALIZADA', units: 1.0,
      present: [tomás, lucía, emilio], absent: [],
    },
    {
      groupId: g3.id, date: '2026-06-06', status: 'REALIZADA', units: 1.0,
      present: [tomás, lucía], absent: [emilio],
    },
    {
      groupId: g3.id, date: '2026-06-13', status: 'REALIZADA', units: 1.0,
      present: [tomás, lucía, emilio], absent: [],
    },
  ];

  let sessionsCreated = 0;
  for (const def of sessionDefs) {
    const dateObj = d(def.date);

    // Skip if already exists
    const existing = await prisma.classSession.findUnique({
      where: { groupId_date: { groupId: def.groupId, date: dateObj } },
    });
    if (existing) continue;

    const session = await prisma.classSession.create({
      data: {
        groupId: def.groupId,
        date: dateObj,
        status: def.status,
        effectiveUnits: def.units,
        cancellationReason: def.reason || null,
        assistantId: def.assistantId || null,
      },
    });

    if (def.status !== 'CANCELADA') {
      for (const student of def.present) {
        await prisma.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
          update: { status: 'PRESENTE' },
          create: { sessionId: session.id, studentId: student.id, status: 'PRESENTE', attendanceType: 'REGULAR' },
        });
      }
      for (const student of def.absent) {
        await prisma.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
          update: { status: 'AUSENTE' },
          create: { sessionId: session.id, studentId: student.id, status: 'AUSENTE', attendanceType: 'REGULAR' },
        });
      }
      await calculateCosts(session.id);
    }

    sessionsCreated++;
  }
  console.log(`✅ Sesiones creadas (${sessionsCreated} nuevas, asistencias + costos calculados)`);

  // ── Eventos ───────────────────────────────────────────────────────────────
  const eventDefs = [
    {
      name: 'Torneo Interno STMC — Junio',
      date: d('2026-06-20'),
      professorId: prof1.id,
      fixedRate: 80000,
      description: 'Torneo interno de fin de semestre. Todos los niveles.',
    },
    {
      name: 'Clínica de Saque',
      date: d('2026-06-08'),
      professorId: prof2.id,
      fixedRate: 50000,
      description: 'Taller de técnica de saque con invitado externo. 2 horas.',
    },
  ];

  for (const ev of eventDefs) {
    const existing = await prisma.event.findFirst({ where: { name: ev.name } });
    if (!existing) await prisma.event.create({ data: ev });
  }
  console.log('✅ Eventos creados');

  // ── Solicitudes de inscripción ────────────────────────────────────────────
  const enrollmentDefs = [
    {
      studentName: 'Martina Guzmán',
      birthDate: d('2018-03-14'),
      parentName: 'Laura Guzmán',
      email: 'laura.guzman@gmail.com',
      phone: '3101234567',
      eps: 'Sura',
      notes: 'Nunca ha jugado tenis. Disponible lunes y miércoles en la tarde.',
    },
    {
      studentName: 'Nicolás Herrera',
      birthDate: d('2015-07-22'),
      parentName: 'Jorge Herrera',
      email: 'jorge.herrera@outlook.com',
      phone: '3209876543',
      eps: 'Compensar',
      notes: 'Tiene experiencia previa en tenis recreativo. Prefiere tardes.',
    },
    {
      studentName: 'Sara Mendoza',
      birthDate: d('2010-11-05'),
      parentName: 'Patricia Mendoza',
      email: 'patricia.mendoza@gmail.com',
      phone: '3151234567',
      eps: 'Coomeva',
      paymentDate: d('2026-06-09'),
      notes: 'Ya realizó el pago de inscripción.',
    },
  ];

  for (const req of enrollmentDefs) {
    const existing = await prisma.enrollmentRequest.findFirst({ where: { email: req.email } });
    if (!existing) await prisma.enrollmentRequest.create({ data: req });
  }
  console.log('✅ Solicitudes de inscripción creadas');

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  console.log('  🎾  DATOS DE DEMOSTRACIÓN LISTOS');
  console.log('══════════════════════════════════════════════');
  console.log('\n  Cuentas de acceso:\n');
  console.log('  ROL              EMAIL                    CLAVE');
  console.log('  ───────────────────────────────────────────────');
  console.log('  ADMIN            jasblleidy@gmail.com     (la de Railway)');
  console.log('  TEACHER          brayan@stmc.com          brayan123');
  console.log('  TEACHER          carlos@stmc.com          carlos123');
  console.log('  ASSISTANT        maria@stmc.com           maria123');
  console.log('  PHYSICAL_TRAINER felipe@stmc.com          felipe123');
  console.log('  PARENT           padre1@stmc.com          padre123');
  console.log('  PARENT           padre2@stmc.com          padre123');
  console.log('\n  Datos creados:');
  console.log('  • 2 profesores, 1 asistente, 1 preparador físico, 2 padres');
  console.log('  • 3 grupos (Verde sencilla, Naranja doble, Roja sencilla)');
  console.log('  • 12 estudiantes distribuidos en los grupos');
  console.log('  • 12 sesiones (mayo-junio 2026) con asistencia y costos');
  console.log('  • 2 eventos (torneo + clínica)');
  console.log('  • 3 solicitudes de inscripción pendientes');
  console.log('══════════════════════════════════════════════\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
