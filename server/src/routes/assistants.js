const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { active } = req.query;
    const where = active !== 'false' ? { active: true } : {};
    const assistants = await prisma.assistant.findMany({
      where,
      include: { user: { select: { email: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: assistants });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' });

    let userId = null;
    if (email && password) {
      const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) return res.status(409).json({ success: false, error: 'Email ya registrado' });
      const user = await prisma.user.create({
        data: { email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 10), role: 'ASSISTANT' },
      });
      userId = user.id;
    }

    const assistant = await prisma.assistant.create({
      data: { name, userId },
      include: { user: { select: { email: true } } },
    });
    res.status(201).json({ success: true, data: assistant });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, active, email, password } = req.body;

    const existing = await prisma.assistant.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Asistente no encontrado' });

    const data = {};
    if (name !== undefined) data.name = name;
    if (active !== undefined) data.active = active;

    // Gestionar la cuenta de acceso (crearla, o actualizar email/contraseña).
    const wantsAccount = (email && email.trim()) || (password && password.length > 0);
    if (wantsAccount) {
      if (password && password.length < 8) {
        return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
      }
      const normalizedEmail = email && email.trim() ? email.toLowerCase().trim() : null;
      const existingUser = normalizedEmail ? await prisma.user.findUnique({ where: { email: normalizedEmail } }) : null;

      // Rol dual: vincular a una cuenta que YA existe (mismo correo, sin
      // contraseña) — p. ej. un profesor que además será asistente. No se crea
      // ni se cambia la cuenta; solo se enlaza este asistente a ella.
      if (existingUser && !password && existingUser.id !== existing.userId) {
        data.userId = existingUser.id;
      } else if (existing.userId) {
        const userData = {};
        if (email && email.trim()) {
          const normalized = email.toLowerCase().trim();
          const clash = await prisma.user.findUnique({ where: { email: normalized } });
          if (clash && clash.id !== existing.userId) {
            return res.status(409).json({ success: false, error: 'Email ya registrado' });
          }
          userData.email = normalized;
        }
        if (password) userData.passwordHash = await bcrypt.hash(password, 10);
        if (Object.keys(userData).length > 0) {
          await prisma.user.update({ where: { id: existing.userId }, data: userData });
        }
      } else {
        if (!email || !email.trim() || !password) {
          return res.status(400).json({ success: false, error: 'Correo y contraseña requeridos para crear la cuenta' });
        }
        const normalized = email.toLowerCase().trim();
        const clash = await prisma.user.findUnique({ where: { email: normalized } });
        if (clash) return res.status(409).json({ success: false, error: 'Email ya registrado' });
        const user = await prisma.user.create({
          data: { email: normalized, passwordHash: await bcrypt.hash(password, 10), role: 'ASSISTANT' },
        });
        data.userId = user.id;
      }
    }

    const assistant = await prisma.assistant.update({
      where: { id: req.params.id },
      data,
      include: { user: { select: { email: true } } },
    });
    res.json({ success: true, data: assistant });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
