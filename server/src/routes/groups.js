const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { notSuspended } = require('../lib/filters');

const router = express.Router();

const SUB_LEVELS = ['A', 'B', 'C'];
// Intermedio y Avanzado no manejan subnivel (pendiente de definición del cliente)
const LEVELS_WITHOUT_SUBLEVEL = ['Intermedio', 'Avanzado'];

// Returns the validated subLevel value or an error string.
function validateSubLevel(subLevel, ballLevel) {
  if (subLevel === undefined || subLevel === null || subLevel === '') return { value: null };
  if (!SUB_LEVELS.includes(subLevel)) return { error: 'Subnivel inválido (A, B o C)' };
  if (LEVELS_WITHOUT_SUBLEVEL.includes(ballLevel)) {
    return { error: `El nivel ${ballLevel} no maneja subniveles` };
  }
  return { value: subLevel };
}

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

    // Suspended students are hidden from rosters while their suspension lasts
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { groupId: req.params.id, student: { active: true, ...notSuspended() } },
      include: { student: true },
      orderBy: { student: { name: 'asc' } },
    });
    const students = enrollments.map((e) => e.student);

    // Attach "classes seen / acquired": seen = PRESENTE attendance records within
    // the active semester (falls back to all-time if no semester is active).
    const studentIds = students.map((s) => s.id);
    const seenById = {};
    if (studentIds.length > 0) {
      const activeSemester = await prisma.semester.findFirst({ where: { active: true } });
      const dateFilter = activeSemester
        ? { gte: activeSemester.startDate, lte: activeSemester.endDate }
        : undefined;
      const present = await prisma.attendanceRecord.findMany({
        where: {
          studentId: { in: studentIds },
          status: 'PRESENTE',
          ...(dateFilter ? { session: { date: dateFilter } } : {}),
        },
        select: { studentId: true },
      });
      for (const r of present) seenById[r.studentId] = (seenById[r.studentId] || 0) + 1;
    }

    res.json({
      success: true,
      data: students.map((s) => ({
        ...s,
        classesSeen: seenById[s.id] || 0,
        classesAcquired: s.classesAcquired,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { code, name, professorId, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
      startTime, endTime, court, ballLevel, subLevel } = req.body;

    if (!code || !professorId || !startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'Código, profesor y horario requeridos' });
    }

    const sub = validateSubLevel(subLevel, ballLevel);
    if (sub.error) return res.status(400).json({ success: false, error: sub.error });

    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);

    const group = await prisma.group.create({
      data: {
        code, name, professorId, startTime, endTime, durationMinutes, classUnits: 1.0,
        court: court ? parseInt(court) : null, ballLevel, subLevel: sub.value,
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
      startTime, endTime, court, ballLevel, subLevel, active } = req.body;

    const data = {};
    if (code !== undefined) data.code = code;
    if (name !== undefined) data.name = name;
    if (professorId !== undefined) data.professorId = professorId;
    if (ballLevel !== undefined) data.ballLevel = ballLevel;
    if (subLevel !== undefined || ballLevel !== undefined) {
      const current = await prisma.group.findUnique({ where: { id: req.params.id } });
      const effectiveLevel = ballLevel !== undefined ? ballLevel : current?.ballLevel;
      const effectiveSub = subLevel !== undefined ? subLevel : current?.subLevel;
      const sub = validateSubLevel(effectiveSub, effectiveLevel);
      if (sub.error) return res.status(400).json({ success: false, error: sub.error });
      data.subLevel = sub.value;
    }
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
