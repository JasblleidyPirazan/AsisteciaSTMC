const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { active, groupId } = req.query;
    const where = {};
    if (active !== 'false') where.active = true;

    // Parent can only see their own children
    if (req.user.role === 'PARENT') {
      where.parentUserId = req.user.id;
    }

    const include = { enrollments: { include: { group: { select: { id: true, code: true, name: true } } } } };

    let students;
    if (groupId) {
      const enrollments = await prisma.studentEnrollment.findMany({
        where: { groupId, student: where },
        include: { student: { include: include } },
        orderBy: { student: { name: 'asc' } },
      });
      students = enrollments.map((e) => e.student);
    } else {
      students = await prisma.student.findMany({
        where,
        include,
        orderBy: { name: 'asc' },
      });
    }

    res.json({ success: true, data: students });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'PARENT') {
      const student = await prisma.student.findFirst({
        where: { id: req.params.id, parentUserId: req.user.id },
        include: { enrollments: { include: { group: true } } },
      });
      if (!student) return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
      return res.json({ success: true, data: student });
    }

    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { enrollments: { include: { group: { include: { professor: true } } } } },
    });
    if (!student) return res.status(404).json({ success: false, error: 'Estudiante no encontrado' });
    res.json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, email, parentUserId, primaryGroupId, secondaryGroupId } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' });

    const student = await prisma.student.create({
      data: {
        name,
        email: email || null,
        parentUserId: parentUserId || null,
        enrollments: {
          create: [
            ...(primaryGroupId ? [{ groupId: primaryGroupId, enrollmentType: 'PRIMARY' }] : []),
            ...(secondaryGroupId ? [{ groupId: secondaryGroupId, enrollmentType: 'SECONDARY' }] : []),
          ],
        },
      },
      include: { enrollments: { include: { group: true } } },
    });
    res.status(201).json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, email, parentUserId, active } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (parentUserId !== undefined) data.parentUserId = parentUserId;
    if (active !== undefined) data.active = active;

    const student = await prisma.student.update({
      where: { id: req.params.id },
      data,
      include: { enrollments: { include: { group: true } } },
    });
    res.json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.student.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true, data: { message: 'Estudiante desactivado' } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/enrollments', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { groupId, enrollmentType } = req.body;
    const enrollment = await prisma.studentEnrollment.upsert({
      where: { studentId_groupId: { studentId: req.params.id, groupId } },
      update: { enrollmentType: enrollmentType || 'PRIMARY' },
      create: { studentId: req.params.id, groupId, enrollmentType: enrollmentType || 'PRIMARY' },
    });
    res.json({ success: true, data: enrollment });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/enrollments/:groupId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.studentEnrollment.delete({
      where: { studentId_groupId: { studentId: req.params.id, groupId: req.params.groupId } },
    });
    res.json({ success: true, data: { message: 'Matrícula eliminada' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
