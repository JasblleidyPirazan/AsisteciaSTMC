const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Staff roles the admin can manage here. Professors/assistants have their own
// account flows in /professors and /assistants; parents come from enrollment.
const STAFF_ROLES = ['PHYSICAL_TRAINER', 'RECEPTION'];

router.get('/', requirePermission('roles_accesos', 'view'), async (req, res, next) => {
  try {
    const { role, scope } = req.query;

    // scope=all → vista unificada de todas las cuentas (solo lectura para las
    // que no son de personal). Sin scope → solo cuentas gestionables aquí.
    let where;
    if (scope === 'all') {
      where = {};
    } else if (role) {
      if (!STAFF_ROLES.includes(role)) {
        return res.status(400).json({ success: false, error: 'Rol no gestionable desde aquí' });
      }
      where = { role };
    } else {
      where = { role: { in: STAFF_ROLES } };
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        professor: { select: { name: true } },
        assistant: { select: { name: true } },
      },
      orderBy: { email: 'asc' },
    });

    // Marca qué cuentas se pueden gestionar desde esta pantalla (personal).
    const enriched = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      active: u.active,
      createdAt: u.createdAt,
      name: u.professor?.name || u.assistant?.name || null,
      manageable: STAFF_ROLES.includes(u.role),
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('roles_accesos', 'edit'), async (req, res, next) => {
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

router.put('/:id', requirePermission('roles_accesos', 'edit'), async (req, res, next) => {
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
