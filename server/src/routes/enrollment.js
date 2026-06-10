const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Public: submit enrollment request (no auth required)
router.post('/', async (req, res, next) => {
  try {
    const { studentName, birthDate, parentName, email, phone, eps, paymentDate, paymentProof, notes } = req.body;

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

// Admin: list pending requests
router.get('/requests', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { status } = req.query;
    const requests = await prisma.enrollmentRequest.findMany({
      where: status ? { status } : {},
      orderBy: { submittedAt: 'desc' },
    });
    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
});

// Admin: approve enrollment → creates student + parent user
router.post('/requests/:id/approve', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { groupId, enrollmentType, parentPassword } = req.body;
    if (!parentPassword) {
      return res.status(400).json({ success: false, error: 'Contraseña inicial para el padre requerida' });
    }

    const request = await prisma.enrollmentRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
    if (request.status !== 'PENDING') {
      return res.status(409).json({ success: false, error: 'Solicitud ya procesada' });
    }

    // Check if parent user already exists
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
router.post('/requests/:id/reject', requireRole('ADMIN'), async (req, res, next) => {
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
