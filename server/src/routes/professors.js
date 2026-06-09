const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { active } = req.query;
    const where = active !== 'false' ? { active: true } : {};
    const professors = await prisma.professor.findMany({
      where,
      include: { groups: { where: { active: true }, select: { id: true, code: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: professors });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' });

    let userId = null;
    if (email && password) {
      const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) return res.status(409).json({ success: false, error: 'Email ya registrado' });
      const user = await prisma.user.create({
        data: { email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 10), role: 'TEACHER' },
      });
      userId = user.id;
    }

    const professor = await prisma.professor.create({
      data: { name, userId },
      include: { user: { select: { email: true } } },
    });
    res.status(201).json({ success: true, data: professor });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, active } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (active !== undefined) data.active = active;
    const professor = await prisma.professor.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: professor });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
