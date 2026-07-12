const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || email.length > 254) {
      return res.status(400).json({ success: false, error: 'Email inválido' });
    }
    if (!password || typeof password !== 'string' || password.length > 128) {
      return res.status(400).json({ success: false, error: 'Contraseña inválida' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { professor: { select: { id: true } }, assistant: { select: { id: true } } },
    });

    // Always compare hash to prevent timing attacks (even if user not found)
    const fakeHash = '$2a$10$invalidhashfortimingprotectiononly00000000000000000000';
    const isValid = await bcrypt.compare(password, user?.passwordHash || fakeHash);

    if (!user || !user.active || !isValid) {
      return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id, email: user.email, role: user.role, policiesAcceptedAt: user.policiesAcceptedAt,
          professorId: user.professor?.id || null, assistantId: user.assistant?.id || null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, role: true, active: true, policiesAcceptedAt: true,
        professor: { select: { id: true } }, assistant: { select: { id: true } },
      },
    });
    if (!user || !user.active) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado o inactivo' });
    }
    res.json({
      success: true,
      data: {
        id: user.id, email: user.email, role: user.role, active: user.active,
        policiesAcceptedAt: user.policiesAcceptedAt,
        professorId: user.professor?.id || null, assistantId: user.assistant?.id || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Explicit acceptance of the school policies (first login gate in parent portal)
router.post('/accept-policies', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { policiesAcceptedAt: new Date() },
      select: { id: true, policiesAcceptedAt: true },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// Change password (authenticated)
router.put('/password', authMiddleware, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Contraseña actual y nueva requeridas' });
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ success: false, error: 'La nueva contraseña debe tener entre 8 y 128 caracteres' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Contraseña actual incorrecta' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });

    res.json({ success: true, data: { message: 'Contraseña actualizada correctamente' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
