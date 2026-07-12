const express = require('express');
const XLSX = require('xlsx');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { notSuspended } = require('../lib/filters');
const { seenAttendanceFilter } = require('../services/attendanceStats');

const router = express.Router();

const DAY_SHORT = [['lunes', 'Lun'], ['martes', 'Mar'], ['miercoles', 'Mié'], ['jueves', 'Jue'], ['viernes', 'Vie'], ['sabado', 'Sáb'], ['domingo', 'Dom']];
function daysText(g) {
  return DAY_SHORT.filter(([k]) => g[k]).map(([, l]) => l).join(', ');
}

// Subniveles válidos por nivel (definición del cliente).
const SUBLEVELS_BY_LEVEL = {
  Roja: ['A', 'B', 'C'],
  Naranja: ['A', 'B', 'C'],
  Verde: ['A', 'B', 'C'],
  Amarilla: ['Principiante', 'Intermedio', 'Avanzado'],
};

// Returns the validated subLevel value or an error string.
function validateSubLevel(subLevel, ballLevel) {
  if (subLevel === undefined || subLevel === null || subLevel === '') return { value: null };
  const allowed = SUBLEVELS_BY_LEVEL[ballLevel];
  if (!allowed) return { error: `El nivel ${ballLevel || '(sin nivel)'} no maneja subniveles` };
  if (!allowed.includes(subLevel)) return { error: `Subnivel inválido para ${ballLevel}` };
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
    // active='all' → activos e inactivos (para el resumen de la página de grupos)
    const where = active === 'all' ? {} : { active: active !== 'false' };

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
      include: {
        professor: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ startTime: 'asc' }],
    });

    res.json({ success: true, data: groups });
  } catch (err) {
    next(err);
  }
});

// Exportar grupos a Excel.
router.get('/export', requireRole('ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const groups = await prisma.group.findMany({
      where: { active: true },
      include: { professor: { select: { name: true } }, _count: { select: { enrollments: true } } },
      orderBy: [{ court: 'asc' }, { startTime: 'asc' }],
    });
    const rows = groups.map((g) => ({
      Grupo: g.code,
      Días: daysText(g),
      Hora: `${g.startTime} - ${g.endTime}`,
      Profesor: g.professor?.name || '',
      Cancha: g.court || '',
      Nivel: g.ballLevel || '',
      Subnivel: g.subLevel || '',
      Cupo: g.capacity,
      Inscritos: g._count.enrollments,
      'Ocupación %': g.capacity ? Math.round((g._count.enrollments / g.capacity) * 100) : 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Grupo: 'Sin grupos' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Grupos');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="grupos.xlsx"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// Malla de horarios (canchas × horas). Accesible a CUALQUIER rol autenticado.
// Devuelve los grupos activos con cancha/horario/días/nivel/profesor y su conteo
// de estudiantes. La lista de estudiantes se incluye solo para el personal; un
// acudiente (PARENT) solo ve a sus propios hijos.
router.get('/schedule', async (req, res, next) => {
  try {
    const role = req.user.role;
    const isStaff = ['ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER', 'TEACHER', 'ASSISTANT', 'RECEPTION'].includes(role);

    let parentIds = null;
    if (role === 'PARENT') {
      const kids = await prisma.student.findMany({
        where: { parentUserId: req.user.id, active: true },
        select: { id: true },
      });
      parentIds = new Set(kids.map((k) => k.id));
    }

    const groups = await prisma.group.findMany({
      where: { active: true },
      include: {
        professor: { select: { id: true, name: true } },
        enrollments: { include: { student: { select: { id: true, name: true, active: true } } } },
      },
      orderBy: [{ startTime: 'asc' }, { court: 'asc' }],
    });

    const data = groups.map((g) => {
      const activeEnr = g.enrollments.filter((e) => e.student?.active);
      let students = [];
      if (isStaff) {
        students = activeEnr.map((e) => ({ id: e.student.id, name: e.student.name }));
      } else if (parentIds) {
        students = activeEnr
          .filter((e) => parentIds.has(e.student.id))
          .map((e) => ({ id: e.student.id, name: e.student.name }));
      }
      return {
        id: g.id, code: g.code, name: g.name, court: g.court,
        startTime: g.startTime, endTime: g.endTime,
        ballLevel: g.ballLevel, subLevel: g.subLevel, capacity: g.capacity,
        days: {
          lunes: g.lunes, martes: g.martes, miercoles: g.miercoles, jueves: g.jueves,
          viernes: g.viernes, sabado: g.sabado, domingo: g.domingo,
        },
        professor: g.professor,
        studentCount: activeEnr.length,
        students,
      };
    });

    res.json({ success: true, data });
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
          AND: [
            seenAttendanceFilter(),
            ...(dateFilter ? [{ session: { date: dateFilter } }] : []),
          ],
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

router.post('/', requireRole('ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { code, name, professorId, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
      startTime, endTime, court, capacity, ballLevel, subLevel } = req.body;

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
        court: court ? parseInt(court) : null,
        capacity: Number.isFinite(+capacity) ? Math.max(1, parseInt(capacity)) : 8,
        ballLevel, subLevel: sub.value,
        lunes: !!lunes, martes: !!martes, miercoles: !!miercoles, jueves: !!jueves,
        viernes: !!viernes, sabado: !!sabado, domingo: !!domingo,
      },
      include: { professor: { select: { id: true, name: true } }, _count: { select: { enrollments: true } } },
    });
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { code, name, professorId, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
      startTime, endTime, court, capacity, ballLevel, subLevel, active } = req.body;

    const data = {};
    if (code !== undefined) data.code = code;
    if (name !== undefined) data.name = name;
    if (professorId !== undefined) data.professorId = professorId;
    if (capacity !== undefined) data.capacity = Math.max(1, parseInt(capacity) || 8);
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
      include: { professor: { select: { id: true, name: true } }, _count: { select: { enrollments: true } } },
    });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
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
