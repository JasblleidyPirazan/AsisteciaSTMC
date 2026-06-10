const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all semesters
router.get('/', async (req, res, next) => {
  try {
    const semesters = await prisma.semester.findMany({
      include: { exclusions: { orderBy: { date: 'asc' } } },
      orderBy: { startDate: 'desc' },
    });
    res.json({ success: true, data: semesters });
  } catch (err) {
    next(err);
  }
});

// Get current active semester
router.get('/active', async (req, res, next) => {
  try {
    const semester = await prisma.semester.findFirst({
      where: { active: true },
      include: { exclusions: { orderBy: { date: 'asc' } } },
    });
    res.json({ success: true, data: semester });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, startDate, endDate, active } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'Nombre, fecha inicio y fecha fin requeridos' });
    }

    // If marking as active, deactivate all others first
    if (active) {
      await prisma.semester.updateMany({ data: { active: false } });
    }

    const semester = await prisma.semester.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        active: !!active,
      },
      include: { exclusions: true },
    });
    res.status(201).json({ success: true, data: semester });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, startDate, endDate, active } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = new Date(endDate);
    if (active !== undefined) {
      data.active = active;
      if (active) {
        await prisma.semester.updateMany({
          where: { id: { not: req.params.id } },
          data: { active: false },
        });
      }
    }

    const semester = await prisma.semester.update({
      where: { id: req.params.id },
      data,
      include: { exclusions: { orderBy: { date: 'asc' } } },
    });
    res.json({ success: true, data: semester });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.semesterExclusion.deleteMany({ where: { semesterId: req.params.id } });
    await prisma.semester.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { message: 'Semestre eliminado' } });
  } catch (err) {
    next(err);
  }
});

// Exclusions
router.post('/:id/exclusions', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { date, reason } = req.body;
    if (!date) return res.status(400).json({ success: false, error: 'Fecha requerida' });

    const exclusion = await prisma.semesterExclusion.create({
      data: { semesterId: req.params.id, date: new Date(date), reason: reason || null },
    });
    res.status(201).json({ success: true, data: exclusion });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/exclusions/:exclusionId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.semesterExclusion.delete({ where: { id: req.params.exclusionId } });
    res.json({ success: true, data: { message: 'Fecha excluida eliminada' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
