import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { conflict } from '../lib/errors.js';

// HU-ADM-01: configurar tarifas. Los cambios aplican hacia adelante; los
// cost_records existentes conservan la tarifa vigente al momento del registro.
export const settingsSchema = z.object({
  studentRate: z.number().nonnegative(),
  assistantFixedRate: z.number().nonnegative(),
  groupMakeupRate: z.number().nonnegative(),
});

export async function getSettingsHandler(_req, res) {
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  res.json({ settings });
}

export async function updateSettings(req, res) {
  const { studentRate, assistantFixedRate, groupMakeupRate } = req.body;
  const settings = await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', studentRate, assistantFixedRate, groupMakeupRate },
    update: { studentRate, assistantFixedRate, groupMakeupRate },
  });
  res.json({ settings });
}

// Gestión de usuarios (profesores / asistentes).
export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'TEACHER', 'ASSISTANT', 'PARENT']),
  password: z.string().min(6),
});

export async function createUser(req, res) {
  const { email, name, role, password } = req.body;
  const lower = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: lower } });
  if (existing) throw conflict('Ya existe una cuenta con ese correo');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: lower, name, role, passwordHash, active: true },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  res.status(201).json({ user });
}

export async function listUsers(req, res) {
  const { role } = req.query;
  const users = await prisma.user.findMany({
    where: role ? { role } : undefined,
    select: { id: true, email: true, name: true, role: true, active: true },
    orderBy: { name: 'asc' },
  });
  res.json({ users });
}

// HU-ADM-02: reportes globales consolidados de un período (quincena).
export async function globalReport(req, res) {
  const { period } = req.params;
  const [year, month, half] = period.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, half === 1 ? 1 : 16));
  const end = new Date(Date.UTC(year, month - 1, half === 1 ? 16 : 1 + new Date(year, month, 0).getDate()));

  const sessions = await prisma.classSession.findMany({
    where: { date: { gte: start, lt: end } },
    include: { attendance: true, group: { select: { code: true, professorId: true } } },
  });

  const realized = sessions.filter((s) => s.status === 'REALIZADA' || s.status === 'CANCELADA_MITAD');
  const cancelled = sessions.filter((s) => s.status === 'CANCELADA');

  const attendance = realized.flatMap((s) => s.attendance);
  const present = attendance.filter((a) => a.status === 'PRESENTE').length;
  const attendanceRate = attendance.length ? round2((present / attendance.length) * 100) : 0;

  const costAgg = await prisma.costRecord.aggregate({
    where: { period },
    _sum: { total: true },
  });

  res.json({
    period,
    metrics: {
      classesRealized: realized.length,
      classesCancelled: cancelled.length,
      attendanceRate,
      totalToPay: Number(costAgg._sum.total ?? 0),
    },
  });
}

const round2 = (v) => Math.round(v * 100) / 100;
