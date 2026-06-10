const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const DAY_MAP = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
};

router.get('/', async (req, res, next) => {
  try {
    const { today, active } = req.query;
    const where = { active: active !== 'false' };

    if (today === 'true') {
      const dayField = DAY_MAP[new Date().getDay()];
      where[dayField] = true;
    }

    // Teachers only see their own groups
    if (req.user.role === 'TEACHER') {
      const professor = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      if (professor) where.professorId = professor.id;
    }

    const groups = await prisma.group.findMany({
      where,
      include: { professor: { select: { id: true, name: true } } },
      orderBy: [{ startTime: 'asc' }],
    });

    res.json({ success: true, data: groups });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const group = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: {
        professor: { select: { id: true, name: true } },
        enrollments: { include: { student: true } },
      },
    });
    if (!group) return res.status(404).json({ success: false, error: 'Grupo no encontrado' });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/students', async (req, res, next) => {
  try {
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { groupId: req.params.id, student: { active: true } },
      include: { student: true },
      orderBy: { student: { name: 'asc' } },
    });
    res.json({ success: true, data: enrollments.map((e) => e.student) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { code, name, professorId, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
      startTime, endTime, court, ballLevel } = req.body;

    if (!code || !professorId || !startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'Código, profesor y horario requeridos' });
    }

    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
    const classUnits = durationMinutes >= 80 ? 2.0 : 1.0;

    const group = await prisma.group.create({
      data: {
        code, name, professorId, startTime, endTime, durationMinutes, classUnits,
        court: court ? parseInt(court) : null, ballLevel,
        lunes: !!lunes, martes: !!martes, miercoles: !!miercoles, jueves: !!jueves,
        viernes: !!viernes, sabado: !!sabado, domingo: !!domingo,
      },
      include: { professor: { select: { id: true, name: true } } },
    });
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { code, name, professorId, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
      startTime, endTime, court, ballLevel, active } = req.body;

    const data = {};
    if (code !== undefined) data.code = code;
    if (name !== undefined) data.name = name;
    if (professorId !== undefined) data.professorId = professorId;
    if (ballLevel !== undefined) data.ballLevel = ballLevel;
    if (court !== undefined) data.court = court ? parseInt(court) : null;
    if (active !== undefined) data.active = active;
    if (lunes !== undefined) data.lunes = !!lunes;
    if (martes !== undefined) data.martes = !!martes;
    if (miercoles !== undefined) data.miercoles = !!miercoles;
    if (jueves !== undefined) data.jueves = !!jueves;
    if (viernes !== undefined) data.viernes = !!viernes;
    if (sabado !== undefined) data.sabado = !!sabado;
    if (domingo !== undefined) data.domingo = !!domingo;

    if (startTime !== undefined || endTime !== undefined) {
      const existing = await prisma.group.findUnique({ where: { id: req.params.id } });
      const st = startTime || existing.startTime;
      const et = endTime || existing.endTime;
      const [sh, sm] = st.split(':').map(Number);
      const [eh, em] = et.split(':').map(Number);
      data.startTime = st;
      data.endTime = et;
      data.durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
      data.classUnits = data.durationMinutes >= 80 ? 2.0 : 1.0;
    }

    const group = await prisma.group.update({
      where: { id: req.params.id },
      data,
      include: { professor: { select: { id: true, name: true } } },
    });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    await prisma.group.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true, data: { message: 'Grupo desactivado' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
