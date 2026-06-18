import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../middleware/auth.js';
import { unauthorized } from '../lib/errors.js';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    throw unauthorized('Credenciales inválidas');
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}

export async function me(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  res.json({ user });
}
