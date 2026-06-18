import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { forbidden, notFound } from '../lib/errors.js';

// Crear estudiante manualmente (admin), opcionalmente asignado a un grupo.
export const createStudentSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
});

export async function createStudent(req, res) {
  const { name, parentId, groupId } = req.body;
  const student = await prisma.$transaction(async (tx) => {
    const created = await tx.student.create({ data: { name, parentId, active: true } });
    if (groupId) {
      await tx.studentEnrollment.create({
        data: { studentId: created.id, groupId, isPrimary: true, active: true },
      });
    }
    return created;
  });
  res.status(201).json({ student });
}

export async function listStudents(req, res) {
  // Profesor ve solo sus estudiantes; acudiente solo sus hijos.
  const where = {};
  if (req.user.role === 'TEACHER') {
    where.enrollments = { some: { active: true, group: { professorId: req.user.id } } };
  } else if (req.user.role === 'PARENT') {
    where.parentId = req.user.id;
  }

  const students = await prisma.student.findMany({
    where,
    include: {
      enrollments: {
        where: { active: true },
        include: { group: { select: { id: true, code: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });
  res.json({ students });
}

// HU (Estudiantes): historial de asistencia y conteo por período.
export async function getStudentHistory(req, res) {
  const { id } = req.params;
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw notFound('Estudiante no encontrado');

  // El acudiente solo puede ver a su propio hijo.
  if (req.user.role === 'PARENT' && student.parentId !== req.user.id) {
    throw forbidden('Solo puede ver la información de su hijo/a');
  }

  const records = await prisma.attendanceRecord.findMany({
    where: { studentId: id },
    include: {
      session: {
        select: { date: true, status: true, group: { select: { code: true } } },
      },
    },
    orderBy: { session: { date: 'desc' } },
  });

  const counts = records.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.status === 'PRESENTE') acc.present += 1;
      if (r.attendanceType === 'REPOSICION') acc.makeups += 1;
      return acc;
    },
    { total: 0, present: 0, makeups: 0 },
  );

  res.json({
    student: { id: student.id, name: student.name },
    counts,
    records: records.map((r) => ({
      date: r.session.date,
      group: r.session.group.code,
      status: r.status,
      type: r.attendanceType,
      justification: r.justification,
    })),
  });
}

export const enrollSchema = z.object({
  groupId: z.string().uuid(),
  isPrimary: z.boolean().optional(),
});

export async function enrollStudent(req, res) {
  const enrollment = await prisma.studentEnrollment.create({
    data: {
      studentId: req.params.id,
      groupId: req.body.groupId,
      isPrimary: req.body.isPrimary ?? false,
      active: true,
    },
  });
  res.status(201).json({ enrollment });
}
