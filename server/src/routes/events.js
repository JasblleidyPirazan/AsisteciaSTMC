const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      where: { active: true },
      include: { professor: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });
    res.json({ success: true, data: events });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, date, professorId, fixedRate, description } = req.body;
    if (!name || !date || !professorId || !fixedRate) {
      return res.status(400).json({ success: false, error: 'Nombre, fecha, profesor y valor requeridos' });
    }
    const event = await prisma.event.create({
      data: { name, date: new Date(date), professorId, fixedRate: parseFloat(fixedRate), description },
      include: { professor: { select: { id: true, name: true } } },
    });
    res.status(201).json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, date, professorId, fixedRate, description, active } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (date !== undefined) data.date = new Date(date);
    if (professorId !== undefined) data.professorId = professorId;
    if (fixedRate !== undefined) data.fixedRate = parseFloat(fixedRate);
    if (description !== undefined) data.description = description;
    if (active !== undefined) data.active = active;

    const event = await prisma.event.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
