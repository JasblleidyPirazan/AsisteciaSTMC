const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Roles gestionables desde esta pantalla. Profesores/asistentes tienen su propio
// flujo (/professors, /assistants) y los acudientes vienen de inscripciones.
// Roles "elevados" solo los puede crear/gestionar un SUPER_ADMIN o DEVELOPER
// (evita escalada de privilegios: un admin normal no puede crear un super admin).
const BASIC_MANAGED = ['PHYSICAL_TRAINER', 'RECEPTION', 'READ_ONLY'];
const ELEVATED = ['SUPER_ADMIN', 'DEVELOPER', 'ADMIN'];
const MANAGEABLE = [...BASIC_MANAGED, ...ELEVATED];

function canManage(callerRole, targetRole) {
  // Roles elevados (Admin/Super Admin/Desarrollador) solo los gestiona un
  // Administrador o superior; los básicos, cualquiera con roles_accesos.edit.
  if (ELEVATED.includes(targetRole)) return ['ADMIN', 'SUPER_ADMIN', 'DEVELOPER'].includes(callerRole);
  if (BASIC_MANAGED.includes(targetRole)) return true;
  return false; // TEACHER/ASSISTANT/PARENT se gestionan en otras pantallas
}

router.get('/', requirePermission('roles_accesos', 'view'), async (req, res, next) => {
  try {
    const { role, scope } = req.query;

    // scope=all → vista unificada de todas las cuentas (solo lectura para las
    // que no son de personal). Sin scope → solo cuentas gestionables aquí.
    let where;
    if (scope === 'all') {
      where = {};
    } else if (role) {
      if (!MANAGEABLE.includes(role)) {
        return res.status(400).json({ success: false, error: 'Rol no gestionable desde aquí' });
      }
      where = { role };
    } else {
      where = { role: { in: MANAGEABLE } };
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
      manageable: canManage(req.user.role, u.role),
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
    if (!MANAGEABLE.includes(role)) {
      return res.status(400).json({ success: false, error: 'Rol inválido' });
    }
    if (!canManage(req.user.role, role)) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para crear cuentas con ese rol' });
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
    if (!canManage(req.user.role, existing.role)) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para gestionar esta cuenta' });
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
