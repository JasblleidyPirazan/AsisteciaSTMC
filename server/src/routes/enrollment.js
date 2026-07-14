const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { byGroupCode } = require('../lib/sort');

const router = express.Router();

const enrollmentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Demasiadas solicitudes. Intenta en 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public: list active groups with available spots (for enrollment page)
router.get('/groups', async (req, res, next) => {
  try {
    const groups = await prisma.group.findMany({
      where: { active: true },
      include: {
        professor: { select: { name: true } },
        enrollments: {
          where: { enrollmentType: 'PRIMARY', student: { active: true } },
          select: { studentId: true },
        },
      },
    });
    groups.sort(byGroupCode);

    const data = groups.map((g) => {
      const maxStudents = g.ballLevel === 'Roja' ? 6 : 4;
      const enrolled = g.enrollments.length;
      return {
        id: g.id,
        code: g.code,
        name: g.name,
        professor: g.professor?.name || '',
        startTime: g.startTime,
        endTime: g.endTime,
        ballLevel: g.ballLevel,
        durationMinutes: g.durationMinutes,
        court: g.court,
        lunes: g.lunes,
        martes: g.martes,
        miercoles: g.miercoles,
        jueves: g.jueves,
        viernes: g.viernes,
        sabado: g.sabado,
        domingo: g.domingo,
        enrolled,
        maxStudents,
        availableSpots: Math.max(0, maxStudents - enrolled),
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Public: submit enrollment request (rate-limited, no auth)
router.post('/', enrollmentLimiter, async (req, res, next) => {
  try {
    const {
      studentName, birthDate, parentName, email, phone, eps,
      paymentDate, paymentProof, notes,
      preferredGroupId, preferredSecondaryGroupId,
    } = req.body;

    if (!studentName || typeof studentName !== 'string' || studentName.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Nombre del estudiante inválido (mínimo 2 caracteres)' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Email inválido' });
    }
    if (studentName.length > 200 || email.length > 254) {
      return res.status(400).json({ success: false, error: 'Datos demasiado largos' });
    }
    if (parentName && parentName.length > 200) {
      return res.status(400).json({ success: false, error: 'Nombre del acudiente demasiado largo' });
    }
    if (paymentProof && typeof paymentProof === 'string') {
      if (!paymentProof.startsWith('data:image/')) {
        return res.status(400).json({ success: false, error: 'El soporte de pago debe ser una imagen' });
      }
      if (paymentProof.length > 4 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'La imagen del soporte es demasiado grande (máx. 3MB)' });
      }
    }

    if (preferredGroupId) {
      const g = await prisma.group.findUnique({ where: { id: preferredGroupId }, select: { id: true, active: true } });
      if (!g || !g.active) {
        return res.status(400).json({ success: false, error: 'Grupo principal no encontrado' });
      }
    }
    if (preferredSecondaryGroupId) {
      const g = await prisma.group.findUnique({ where: { id: preferredSecondaryGroupId }, select: { id: true, active: true } });
      if (!g || !g.active) {
        return res.status(400).json({ success: false, error: 'Grupo secundario no encontrado' });
      }
    }

    const request = await prisma.enrollmentRequest.create({
      data: {
        studentName: studentName.trim(),
        birthDate: birthDate ? new Date(birthDate) : null,
        parentName: parentName?.trim() || null,
        email: email.toLowerCase().trim(),
        phone: phone?.slice(0, 30) || null,
        eps: eps?.slice(0, 100) || null,
        paymentDate: paymentDate ? new Date(paymentDate) : null,
        paymentProof: paymentProof || null,
        notes: notes?.slice(0, 1000) || null,
        preferredGroupId: preferredGroupId || null,
        preferredSecondaryGroupId: preferredSecondaryGroupId || null,
      },
    });
    res.status(201).json({
      success: true,
      data: { message: 'Solicitud de inscripción enviada. Nos contactaremos pronto.', id: request.id },
    });
  } catch (err) {
    next(err);
  }
});

// Admin: list requests
router.get('/requests', authMiddleware, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { status } = req.query;
    const requests = await prisma.enrollmentRequest.findMany({
      where: status ? { status } : {},
      orderBy: { submittedAt: 'desc' },
    });

    const groupIds = [...new Set(
      requests.flatMap((r) => [r.preferredGroupId, r.preferredSecondaryGroupId].filter(Boolean))
    )];
    const groups = groupIds.length > 0
      ? await prisma.group.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, code: true, startTime: true, endTime: true, ballLevel: true },
        })
      : [];
    const groupMap = Object.fromEntries(groups.map((g) => [g.id, g]));

    const data = requests.map((r) => ({
      ...r,
      preferredGroup: r.preferredGroupId ? (groupMap[r.preferredGroupId] || null) : null,
      preferredSecondaryGroup: r.preferredSecondaryGroupId ? (groupMap[r.preferredSecondaryGroupId] || null) : null,
    }));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Admin: approve enrollment → creates student + parent user
router.post('/requests/:id/approve', authMiddleware, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { groupId, enrollmentType, parentPassword } = req.body;
    if (!parentPassword || typeof parentPassword !== 'string' || parentPassword.length < 8 || parentPassword.length > 128) {
      return res.status(400).json({ success: false, error: 'La contraseña inicial del padre debe tener entre 8 y 128 caracteres' });
    }

    const request = await prisma.enrollmentRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
    if (request.status !== 'PENDING') {
      return res.status(409).json({ success: false, error: 'Solicitud ya procesada' });
    }

    let parentUser = await prisma.user.findUnique({ where: { email: request.email } });
    if (!parentUser) {
      parentUser = await prisma.user.create({
        data: {
          email: request.email,
          passwordHash: await bcrypt.hash(parentPassword, 10),
          role: 'PARENT',
        },
      });
    }

    const student = await prisma.student.create({
      data: {
        name: request.studentName,
        email: request.email,
        parentUserId: parentUser.id,
        enrollments: groupId
          ? { create: [{ groupId, enrollmentType: enrollmentType || 'PRIMARY' }] }
          : undefined,
      },
      include: { enrollments: { include: { group: true } } },
    });

    await prisma.enrollmentRequest.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' },
    });

    res.json({ success: true, data: { student, parentUser: { id: parentUser.id, email: parentUser.email } } });
  } catch (err) {
    next(err);
  }
});

// Admin: reject enrollment
router.post('/requests/:id/reject', authMiddleware, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.enrollmentRequest.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED' },
    });
    res.json({ success: true, data: { message: 'Solicitud rechazada' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
