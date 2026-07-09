const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Staff roles the admin can manage here. Professors/assistants have their own
// account flows in /professors and /assistants; parents come from enrollment.
const STAFF_ROLES = ['PHYSICAL_TRAINER', 'RECEPTION'];

router.get('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { role } = req.query;
    const where = { role: role ? role : { in: STAFF_ROLES } };
    if (role && !STAFF_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: 'Rol no gestionable desde aquí' });
    }
    const users = await prisma.user.findMany({
      where,
      select: { id: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { email: 'asc' },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !email.trim() || !password || !role) {
      return res.status(400).json({ success: false, error: 'Correo, contraseña y rol requeridos' });
    }
    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: 'Rol inválido' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    const normalized = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) return res.status(409).json({ success: false, error: 'Email ya registrado' });

    const user = await prisma.user.create({
      data: { email: normalized, passwordHash: await bcrypt.hash(password, 10), role },
      select: { id: true, email: true, role: true, active: true, createdAt: true },
    });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { active, password } = req.body;

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    if (!STAFF_ROLES.includes(existing.role)) {
      return res.status(400).json({ success: false, error: 'Rol no gestionable desde aquí' });
    }

    const data = {};
    if (active !== undefined) data.active = !!active;
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
      }
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, role: true, active: true, createdAt: true },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
