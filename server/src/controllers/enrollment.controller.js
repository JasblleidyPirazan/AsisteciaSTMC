import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';

// HU-INS-01: Formulario público de inscripción (sin autenticación).
export const createRequestSchema = z.object({
  studentName: z.string().min(1, 'Nombre del estudiante requerido'),
  parentName: z.string().min(1, 'Nombre del acudiente requerido'),
  email: z.string().email('Correo inválido'),
  phone: z.string().min(5, 'Teléfono inválido'),
});

export async function createRequest(req, res) {
  const request = await prisma.enrollmentRequest.create({
    data: { ...req.body, status: 'PENDIENTE' },
  });
  res.status(201).json({
    message: 'Solicitud de inscripción recibida. Será revisada por el administrador.',
    request,
  });
}

// HU-INS-02: Listar solicitudes (admin), ordenadas por fecha.
export async function listRequests(req, res) {
  const { status } = req.query;
  const requests = await prisma.enrollmentRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'asc' },
  });
  res.json({ requests });
}

// HU-INS-02: Aprobar solicitud -> crea student + enrollment + cuenta PARENT en una operación.
export const approveSchema = z.object({
  groupId: z.string().uuid('Grupo inválido'),
  maxClasses: z.number().int().positive().optional(),
});

export async function approveRequest(req, res) {
  const { id } = req.params;
  const { groupId } = req.body;

  const request = await prisma.enrollmentRequest.findUnique({ where: { id } });
  if (!request) throw notFound('Solicitud no encontrada');
  if (request.status !== 'PENDIENTE') throw conflict('La solicitud ya fue resuelta');

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw notFound('Grupo no encontrado');

  const email = request.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict('Ya existe una cuenta con ese correo');

  // Contraseña temporal: el teléfono (el admin la comunica al PF).
  const tempPassword = request.phone;
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const result = await prisma.$transaction(async (tx) => {
    const parent = await tx.user.create({
      data: { email, name: request.parentName, role: 'PARENT', passwordHash, active: true },
    });
    const student = await tx.student.create({
      data: { name: request.studentName, parentId: parent.id, active: true },
    });
    await tx.studentEnrollment.create({
      data: { studentId: student.id, groupId, isPrimary: true, active: true },
    });
    await tx.enrollmentRequest.update({
      where: { id },
      data: { status: 'APROBADA', resolvedAt: new Date() },
    });
    return { parent, student };
  });

  res.json({
    message: 'Inscripción aprobada. Cuenta del acudiente creada.',
    student: result.student,
    parent: { id: result.parent.id, email: result.parent.email },
    tempPassword,
  });
}

// HU-INS-02: Rechazar solicitud (motivo obligatorio).
export const rejectSchema = z.object({
  reason: z.string().min(1, 'El motivo de rechazo es obligatorio'),
});

export async function rejectRequest(req, res) {
  const { id } = req.params;
  const request = await prisma.enrollmentRequest.findUnique({ where: { id } });
  if (!request) throw notFound('Solicitud no encontrada');
  if (request.status !== 'PENDIENTE') throw conflict('La solicitud ya fue resuelta');

  const updated = await prisma.enrollmentRequest.update({
    where: { id },
    data: { status: 'RECHAZADA', rejectionReason: req.body.reason, resolvedAt: new Date() },
  });
  res.json({ message: 'Solicitud rechazada', request: updated });
}
