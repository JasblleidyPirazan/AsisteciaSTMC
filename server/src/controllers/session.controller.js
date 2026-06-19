import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { groupRunsOn } from '../utils/group.js';
import { previewSessionCost, recomputeSessionCosts, getSettings } from '../services/costEngine.js';

const dateOnly = (value) => {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const isFuture = (date) => dateOnly(date).getTime() > dateOnly(new Date()).getTime();

// Verifica que el usuario pueda operar sobre el grupo (titular, sustituto admin, o PF con hijo).
async function assertCanOperateGroup(user, group) {
  if (user.role === 'ADMIN') return;
  if (user.role === 'TEACHER' && group.professorId === user.id) return;
  if (user.role === 'PARENT') {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { active: true, groupId: group.id, student: { parentId: user.id } },
    });
    if (enrollment) return;
  }
  throw forbidden('No tiene permisos sobre este grupo');
}

// Pantalla 4: contexto de la sesión (estudiantes del grupo + sesión existente si la hay).
export async function getSessionContext(req, res) {
  const { groupId } = req.params;
  const date = dateOnly(req.query.date ?? new Date());

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      professor: { select: { id: true, name: true } },
      enrollments: {
        where: { active: true },
        include: { student: { select: { id: true, name: true } } },
      },
    },
  });
  if (!group) throw notFound('Grupo no encontrado');
  await assertCanOperateGroup(req.user, group);

  const session = await prisma.classSession.findUnique({
    where: { groupId_date: { groupId, date } },
    include: { attendance: { include: { student: { select: { id: true, name: true } } } } },
  });

  // Profesores activos disponibles como sustituto (HU-AST-05).
  const professors = await prisma.user.findMany({
    where: { role: 'TEACHER', active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  res.json({
    group: {
      id: group.id,
      code: group.code,
      classType: Number(group.classUnits) >= 2 ? 'doble' : 'sencilla',
      classUnits: Number(group.classUnits),
      professor: group.professor,
    },
    professors,
    students: group.enrollments.map((e) => ({
      studentId: e.student.id,
      name: e.student.name,
      attendanceType: 'REGULAR',
    })),
    session: session
      ? {
          id: session.id,
          status: session.status,
          locked: session.locked,
          effectiveUnits: Number(session.effectiveUnits),
          attendance: session.attendance.map((a) => ({
            studentId: a.studentId,
            name: a.student.name,
            status: a.status,
            attendanceType: a.attendanceType,
            justification: a.justification,
          })),
        }
      : null,
  });
}

const attendanceItemSchema = z.object({
  studentId: z.string().uuid(),
  status: z.enum(['PRESENTE', 'AUSENTE', 'JUSTIFICADA']),
  attendanceType: z.enum(['REGULAR', 'REPOSICION']).default('REGULAR'),
  justification: z.string().optional(),
});

// HU-AST-06: vista previa del cálculo de pago (no persiste).
export const previewSchema = z.object({
  groupId: z.string().uuid(),
  cancelledHalf: z.boolean().default(false),
  hasAssistant: z.boolean().default(false),
  attendance: z.array(attendanceItemSchema),
});

export async function previewCost(req, res) {
  const { groupId, cancelledHalf, hasAssistant, attendance } = req.body;
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw notFound('Grupo no encontrado');

  const baseUnits = Number(group.classUnits);
  const effectiveUnits = cancelledHalf ? 1.0 : baseUnits;
  const settings = await getSettings();
  const summary = previewSessionCost({ effectiveUnits, attendance, hasAssistant, settings });
  res.json({ summary });
}

// HU-AST-01/02/04/05: enviar reporte de asistencia (crea/finaliza la sesión y bloquea).
export const submitSchema = z.object({
  groupId: z.string().uuid(),
  date: z.string(),
  held: z.boolean(),
  cancellationReason: z.string().optional(),
  cancelledHalf: z.boolean().default(false),
  substituteProfessorId: z.string().uuid().nullable().optional(),
  assistantId: z.string().uuid().nullable().optional(),
  attendance: z.array(attendanceItemSchema).default([]),
});

export async function submitSession(req, res) {
  const body = req.body;
  const date = dateOnly(body.date);

  if (isFuture(date)) throw badRequest('No se puede registrar una clase en una fecha futura');

  const group = await prisma.group.findUnique({ where: { id: body.groupId } });
  if (!group) throw notFound('Grupo no encontrado');
  await assertCanOperateGroup(req.user, group);

  if (!groupRunsOn(group, date)) {
    throw badRequest('El grupo no tiene clase programada en esa fecha');
  }

  const existing = await prisma.classSession.findUnique({
    where: { groupId_date: { groupId: body.groupId, date } },
  });
  if (existing?.locked) throw conflict('El reporte ya fue enviado y está bloqueado');

  // HU-AST-03: clase no realizada -> CANCELADA, sin costos.
  if (!body.held) {
    if (!body.cancellationReason) throw badRequest('Indique el motivo de cancelación');
    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.classSession.upsert({
        where: { groupId_date: { groupId: body.groupId, date } },
        create: {
          groupId: body.groupId,
          date,
          status: 'CANCELADA',
          effectiveUnits: 0,
          cancellationReason: body.cancellationReason,
          reportedById: req.user.id,
          locked: true,
        },
        update: {
          status: 'CANCELADA',
          effectiveUnits: 0,
          cancellationReason: body.cancellationReason,
          reportedById: req.user.id,
          locked: true,
        },
      });
      await tx.attendanceRecord.deleteMany({ where: { sessionId: s.id } });
      await tx.costRecord.deleteMany({ where: { sessionId: s.id } });
      return s;
    });
    return res.status(201).json({ session, summary: null });
  }

  // HU-AST-04: clase realizada (eventualmente cancelada a la mitad si es doble).
  const baseUnits = Number(group.classUnits);
  const cancelledHalf = body.cancelledHalf && baseUnits >= 2;
  const status = cancelledHalf ? 'CANCELADA_MITAD' : 'REALIZADA';
  const effectiveUnits = cancelledHalf ? 1.0 : baseUnits;

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.classSession.upsert({
      where: { groupId_date: { groupId: body.groupId, date } },
      create: {
        groupId: body.groupId,
        date,
        status,
        effectiveUnits,
        substituteProfessorId: body.substituteProfessorId ?? null,
        assistantId: body.assistantId ?? null,
        reportedById: req.user.id,
        locked: true,
      },
      update: {
        status,
        effectiveUnits,
        cancellationReason: null,
        substituteProfessorId: body.substituteProfessorId ?? null,
        assistantId: body.assistantId ?? null,
        reportedById: req.user.id,
        locked: true,
      },
    });

    // Reemplaza la asistencia por la enviada.
    await tx.attendanceRecord.deleteMany({ where: { sessionId: session.id } });
    if (body.attendance.length) {
      await tx.attendanceRecord.createMany({
        data: body.attendance.map((a) => ({
          sessionId: session.id,
          studentId: a.studentId,
          status: a.status,
          attendanceType: a.attendanceType,
          justification: a.status === 'JUSTIFICADA' ? a.justification ?? null : null,
          reportedById: req.user.id,
        })),
      });
    }

    const { summary } = await recomputeSessionCosts(session.id, tx);
    return { session, summary };
  });

  res.status(201).json(result);
}

// HU-AST-08: clases del día para el asistente (todas).
export async function listAssistantDay(req, res) {
  const date = dateOnly(req.query.date ?? new Date());
  const dayField = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][
    (new Date(date).getUTCDay() + 6) % 7
  ];

  const groups = await prisma.group.findMany({
    where: { active: true, [dayField]: true },
    include: {
      professor: { select: { id: true, name: true } },
      sessions: { where: { date } },
    },
    orderBy: { startTime: 'asc' },
  });

  res.json({
    date: new Date(date).toISOString().slice(0, 10),
    classes: groups.map((g) => {
      const session = g.sessions[0];
      return {
        groupId: g.id,
        code: g.code,
        startTime: g.startTime,
        classType: Number(g.classUnits) >= 2 ? 'doble' : 'sencilla',
        professor: g.professor.name,
        sessionId: session?.id ?? null,
        accompanied: session?.assistantId === req.user.id,
      };
    }),
  });
}

// HU-AST-08: marcar/desmarcar acompañamiento del asistente en una sesión.
export const accompanySchema = z.object({
  groupId: z.string().uuid(),
  date: z.string(),
  accompanied: z.boolean(),
});

export async function setAssistantAccompaniment(req, res) {
  const { groupId, accompanied } = req.body;
  const date = dateOnly(req.body.date);

  const session = await prisma.classSession.findUnique({
    where: { groupId_date: { groupId, date } },
  });
  if (!session) throw notFound('La sesión aún no ha sido registrada por el profesor');

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.classSession.update({
      where: { id: session.id },
      data: { assistantId: accompanied ? req.user.id : null },
    });
    await recomputeSessionCosts(s.id, tx);
    return s;
  });

  res.json({ sessionId: updated.id, accompanied });
}
