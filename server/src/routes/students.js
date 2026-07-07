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
      include: {
        enrollments: { include: { group: { include: { professor: true } } } },
        groupHistory: {
          include: {
            fromGroup: { select: { id: true, code: true } },
            toGroup: { select: { id: true, code: true } },
          },
          orderBy: { changedAt: 'desc' },
        },
      },
    });
    if (!student) return res.status(404).json({ success: false, error: 'Estudiante no encontrado' });
    res.json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { name, email, parentUserId, primaryGroupId, secondaryGroupId, classesAcquired } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' });

    const student = await prisma.student.create({
      data: {
        name,
        email: email || null,
        parentUserId: parentUserId || null,
        classesAcquired: Number.isFinite(+classesAcquired) ? Math.max(0, parseInt(classesAcquired)) : 0,
        enrollments: {
          create: [
            ...(primaryGroupId ? [{ groupId: primaryGroupId, enrollmentType: 'PRIMARY' }] : []),
            ...(secondaryGroupId ? [{ groupId: secondaryGroupId, enrollmentType: 'SECONDARY' }] : []),
          ],
        },
      },
      include: { enrollments: { include: { group: true } } },
    });

    // Record initial group assignment in history
    if (primaryGroupId) {
      await prisma.studentGroupHistory.create({
        data: {
          studentId: student.id,
          fromGroupId: null,
          toGroupId: primaryGroupId,
          actionType: 'ADD_GROUP',
          reason: 'Inscripción inicial',
          changedById: req.user.id,
        },
      });
    }

    res.status(201).json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { name, email, parentUserId, active, deactivationReason, classesAcquired } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (parentUserId !== undefined) data.parentUserId = parentUserId;
    if (classesAcquired !== undefined) data.classesAcquired = Math.max(0, parseInt(classesAcquired) || 0);
    if (active !== undefined) {
      data.active = active;
      if (!active) {
        data.deactivatedAt = new Date();
        data.deactivationReason = deactivationReason || null;
      }
    }

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

router.delete('/:id', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Se requiere un motivo para desactivar el estudiante' });
    }

    await prisma.student.update({
      where: { id: req.params.id },
      data: {
        active: false,
        deactivationReason: reason.trim(),
        deactivatedAt: new Date(),
      },
    });
    res.json({ success: true, data: { message: 'Estudiante desactivado' } });
  } catch (err) {
    next(err);
  }
});

// Transfer student from one group to another (replaces primary enrollment, records history)
router.post('/:id/transfer', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { fromGroupId, toGroupId, reason } = req.body;
    if (!toGroupId) return res.status(400).json({ success: false, error: 'toGroupId requerido' });

    const studentId = req.params.id;

    // If fromGroupId provided, remove that enrollment; otherwise find and remove primary
    if (fromGroupId) {
      await prisma.studentEnrollment.deleteMany({
        where: { studentId, groupId: fromGroupId },
      });
    } else {
      // Remove primary enrollment
      await prisma.studentEnrollment.deleteMany({
        where: { studentId, enrollmentType: 'PRIMARY' },
      });
    }

    // Create new primary enrollment
    await prisma.studentEnrollment.upsert({
      where: { studentId_groupId: { studentId, groupId: toGroupId } },
      update: { enrollmentType: 'PRIMARY' },
      create: { studentId, groupId: toGroupId, enrollmentType: 'PRIMARY' },
    });

    // Record history
    await prisma.studentGroupHistory.create({
      data: {
        studentId,
        fromGroupId: fromGroupId || null,
        toGroupId,
        actionType: 'TRANSFER',
        reason: reason || null,
        changedById: req.user.id,
      },
    });

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        enrollments: { include: { group: { select: { id: true, code: true, name: true } } } },
        groupHistory: {
          include: {
            fromGroup: { select: { id: true, code: true } },
            toGroup: { select: { id: true, code: true } },
          },
          orderBy: { changedAt: 'desc' },
          take: 10,
        },
      },
    });
    res.json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
});

// Add student to an additional group (multigrupo)
router.post('/:id/enrollments', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { groupId, enrollmentType } = req.body;
    const studentId = req.params.id;

    const enrollment = await prisma.studentEnrollment.upsert({
      where: { studentId_groupId: { studentId, groupId } },
      update: { enrollmentType: enrollmentType || 'SECONDARY' },
      create: { studentId, groupId, enrollmentType: enrollmentType || 'SECONDARY' },
    });

    // Record history
    await prisma.studentGroupHistory.create({
      data: {
        studentId,
        fromGroupId: null,
        toGroupId: groupId,
        actionType: 'ADD_GROUP',
        reason: null,
        changedById: req.user.id,
      },
    });

    res.json({ success: true, data: enrollment });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/enrollments/:groupId', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { studentId: sid, groupId } = { studentId: req.params.id, groupId: req.params.groupId };

    await prisma.studentEnrollment.delete({
      where: { studentId_groupId: { studentId: sid, groupId } },
    });

    // Record history
    await prisma.studentGroupHistory.create({
      data: {
        studentId: sid,
        fromGroupId: groupId,
        toGroupId: null,
        actionType: 'REMOVE_GROUP',
        reason: null,
        changedById: req.user.id,
      },
    });

    res.json({ success: true, data: { message: 'Matrícula eliminada' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
