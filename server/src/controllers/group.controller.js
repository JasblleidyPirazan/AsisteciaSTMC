import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import {
  buildGroupCode,
  classUnitsFromDuration,
  dayFlagsFromIndices,
  durationMinutes,
  groupRunsOn,
  weekdayIndex,
} from '../utils/group.js';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

// HU-GRP-01: Crear grupo.
export const createGroupSchema = z.object({
  professorId: z.string().uuid(),
  dayIndices: z.array(z.number().int().min(0).max(6)).min(1, 'Seleccione al menos un día'),
  startTime: z.string().regex(timeRegex, 'Hora inicio inválida (HH:MM)'),
  endTime: z.string().regex(timeRegex, 'Hora fin inválida (HH:MM)'),
  court: z.number().int().positive(),
  ballLevel: z.enum(['VERDE', 'AMARILLA', 'NARANJA', 'ROJA']),
});

export async function createGroup(req, res) {
  const { professorId, dayIndices, startTime, endTime, court, ballLevel } = req.body;

  const minutes = durationMinutes(startTime, endTime);
  if (minutes <= 0) throw badRequest('La hora de fin debe ser posterior a la de inicio');

  const professor = await prisma.user.findFirst({
    where: { id: professorId, role: 'TEACHER' },
  });
  if (!professor) throw notFound('Profesor no encontrado');

  const classUnits = classUnitsFromDuration(minutes);
  const code = buildGroupCode({ dayIndices, startTime, professorName: professor.name, ballLevel });

  const group = await prisma.group.create({
    data: {
      code,
      professorId,
      ...dayFlagsFromIndices(dayIndices),
      startTime,
      endTime,
      durationMinutes: minutes,
      classUnits,
      court,
      ballLevel,
      active: true,
    },
    include: { professor: { select: { id: true, name: true } } },
  });

  res.status(201).json({ group });
}

// HU-GRP-02: Ver grupos del día (filtrados por rol).
export async function listTodayGroups(req, res) {
  const dateParam = req.query.date ? new Date(req.query.date) : new Date();
  const dayField = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][
    weekdayIndex(dateParam)
  ];

  const where = { active: true, [dayField]: true };

  // Un profesor solo ve sus grupos. El acudiente solo grupos de sus hijos.
  if (req.user.role === 'TEACHER') {
    where.professorId = req.user.id;
  } else if (req.user.role === 'PARENT') {
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { active: true, student: { parentId: req.user.id } },
      select: { groupId: true },
    });
    where.id = { in: enrollments.map((e) => e.groupId) };
  }

  const groups = await prisma.group.findMany({
    where,
    include: {
      professor: { select: { id: true, name: true } },
      _count: { select: { enrollments: { where: { active: true } } } },
    },
    orderBy: { startTime: 'asc' },
  });

  const isoDate = dateParam.toISOString().slice(0, 10);
  res.json({
    date: isoDate,
    groups: groups.map((g) => ({
      ...g,
      classType: Number(g.classUnits) >= 2 ? 'doble' : 'sencilla',
      studentCount: g._count.enrollments,
    })),
  });
}

export async function listGroups(_req, res) {
  const groups = await prisma.group.findMany({
    include: { professor: { select: { id: true, name: true } } },
    orderBy: { code: 'asc' },
  });
  res.json({ groups });
}

export async function getGroup(req, res) {
  const group = await prisma.group.findUnique({
    where: { id: req.params.id },
    include: {
      professor: { select: { id: true, name: true } },
      enrollments: {
        where: { active: true },
        include: { student: { select: { id: true, name: true } } },
      },
    },
  });
  if (!group) throw notFound('Grupo no encontrado');
  res.json({ group });
}

export const updateGroupSchema = z.object({
  court: z.number().int().positive().optional(),
  ballLevel: z.enum(['VERDE', 'AMARILLA', 'NARANJA', 'ROJA']).optional(),
  professorId: z.string().uuid().optional(),
  active: z.boolean().optional(),
});

export async function updateGroup(req, res) {
  const group = await prisma.group.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ group });
}

export { groupRunsOn };
