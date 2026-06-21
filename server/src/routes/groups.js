const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { generateUniqueGroupCode } = require('../utils/groupCode');

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
    // Parents may only list students of groups where one of their children is enrolled
    if (req.user.role === 'PARENT') {
      const childEnrollment = await prisma.studentEnrollment.findFirst({
        where: { groupId: req.params.id, student: { parentUserId: req.user.id, active: true } },
      });
      if (!childEnrollment) {
        return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
      }
    }

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
    const { name, professorId, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
      startTime, endTime, court, ballLevel, subLevel, minAge, maxAge } = req.body;

    if (!professorId || !startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'Profesor y horario requeridos' });
    }

    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
    const classUnits = durationMinutes >= 80 ? 2.0 : 1.0;

    // Code is auto-generated (días + hora + cancha + nivel), guaranteed unique
    const code = await generateUniqueGroupCode(prisma, {
      lunes, martes, miercoles, jueves, viernes, sabado, domingo,
      startTime, court: court ? parseInt(court) : null, ballLevel,
    });

    const group = await prisma.group.create({
      data: {
        code, name, professorId, startTime, endTime, durationMinutes, classUnits,
        court: court ? parseInt(court) : null, ballLevel,
        subLevel: subLevel?.trim() || null,
        minAge: minAge ? parseInt(minAge) : null,
        maxAge: maxAge ? parseInt(maxAge) : null,
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
    const { name, professorId, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
      startTime, endTime, court, ballLevel, subLevel, minAge, maxAge, active } = req.body;

    const existing = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Grupo no encontrado' });

    const data = {};
    if (name !== undefined) data.name = name;
    if (professorId !== undefined) data.professorId = professorId;
    if (ballLevel !== undefined) data.ballLevel = ballLevel;
    if (court !== undefined) data.court = court ? parseInt(court) : null;
    if (subLevel !== undefined) data.subLevel = subLevel?.trim() || null;
    if (minAge !== undefined) data.minAge = minAge ? parseInt(minAge) : null;
    if (maxAge !== undefined) data.maxAge = maxAge ? parseInt(maxAge) : null;
    if (active !== undefined) data.active = active;
    if (lunes !== undefined) data.lunes = !!lunes;
    if (martes !== undefined) data.martes = !!martes;
    if (miercoles !== undefined) data.miercoles = !!miercoles;
    if (jueves !== undefined) data.jueves = !!jueves;
    if (viernes !== undefined) data.viernes = !!viernes;
    if (sabado !== undefined) data.sabado = !!sabado;
    if (domingo !== undefined) data.domingo = !!domingo;

    if (startTime !== undefined || endTime !== undefined) {
      const st = startTime || existing.startTime;
      const et = endTime || existing.endTime;
      const [sh, sm] = st.split(':').map(Number);
      const [eh, em] = et.split(':').map(Number);
      data.startTime = st;
      data.endTime = et;
      data.durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
      data.classUnits = data.durationMinutes >= 80 ? 2.0 : 1.0;
    }

    // Regenerate the code if any of its inputs (days, hour, court, level) changed
    const codeInputsTouched = [lunes, martes, miercoles, jueves, viernes, sabado, domingo,
      startTime, court, ballLevel].some((v) => v !== undefined);
    if (codeInputsTouched) {
      const merged = {
        lunes: data.lunes ?? existing.lunes,
        martes: data.martes ?? existing.martes,
        miercoles: data.miercoles ?? existing.miercoles,
        jueves: data.jueves ?? existing.jueves,
        viernes: data.viernes ?? existing.viernes,
        sabado: data.sabado ?? existing.sabado,
        domingo: data.domingo ?? existing.domingo,
        startTime: data.startTime ?? existing.startTime,
        court: data.court !== undefined ? data.court : existing.court,
        ballLevel: data.ballLevel !== undefined ? data.ballLevel : existing.ballLevel,
      };
      data.code = await generateUniqueGroupCode(prisma, merged, req.params.id);
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
    const { reason } = req.body || {};
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Se requiere un motivo para desactivar el grupo' });
    }
    await prisma.group.update({
      where: { id: req.params.id },
      data: { active: false, deactivationReason: reason.trim(), deactivatedAt: new Date() },
    });
    res.json({ success: true, data: { message: 'Grupo desactivado' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
