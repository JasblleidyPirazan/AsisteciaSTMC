const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { calculateCosts } = require('../services/costEngine');

const router = express.Router();

const VALID_STATUSES = ['PRESENTE', 'AUSENTE', 'JUSTIFICADA'];
const CANCEL_CATEGORIES = ['LLUVIA', 'SIN_ESTUDIANTES', 'OTRA'];
const CANCEL_AUTO_TEXT = {
  LLUVIA: 'Cancelada por lluvia',
  SIN_ESTUDIANTES: 'No llegaron estudiantes',
};

/**
 * Who may report a festival: SUPERADMIN / ADMIN / PHYSICAL_TRAINER (coordinador).
 * Professors do NOT report festivals — the coordinator does. A professor who
 * participates in a festival still gets paid via its CostRecord (payroll), which
 * is independent of who reports the attendance.
 */
// eslint-disable-next-line no-unused-vars
async function canReportFestival(user, session) {
  return ['SUPERADMIN', 'ADMIN', 'PHYSICAL_TRAINER'].includes(user.role);
}

function festivalInclude() {
  return {
    festivalProfessors: { include: { professor: { select: { id: true, name: true } } } },
    makeupParticipants: {
      include: { student: { select: { id: true, name: true } } },
      orderBy: { student: { name: 'asc' } },
    },
    attendanceRecords: {
      include: { student: { select: { id: true, name: true } } },
      orderBy: { student: { name: 'asc' } },
    },
  };
}

router.get('/', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { date, status, from, to } = req.query;
    const where = { kind: 'FESTIVAL' };
    if (date) where.date = new Date(date);
    if (status) where.status = status;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const sessions = await prisma.classSession.findMany({
      where,
      include: festivalInclude(),
      orderBy: { date: 'desc' },
    });
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const session = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: festivalInclude(),
    });
    if (!session || session.kind !== 'FESTIVAL') {
      return res.status(404).json({ success: false, error: 'Festival no encontrado' });
    }
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// Create a festival — coordinator/admin builds the roster from the panel
router.post('/', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { date, title, ratePerProfessor, professorIds, studentIds } = req.body;

    if (!date) return res.status(400).json({ success: false, error: 'Fecha requerida' });
    const rate = parseFloat(ratePerProfessor);
    if (!rate || rate <= 0) {
      return res.status(400).json({ success: false, error: 'Define el pago por profesor (igual para todos)' });
    }
    if (!Array.isArray(professorIds) || professorIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Asigna al menos un profesor participante' });
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Inscribe al menos un estudiante' });
    }

    const professors = await prisma.professor.findMany({ where: { id: { in: professorIds } } });
    if (professors.length !== new Set(professorIds).size) {
      return res.status(404).json({ success: false, error: 'Profesor no encontrado' });
    }

    const session = await prisma.classSession.create({
      data: {
        kind: 'FESTIVAL',
        groupId: null,
        title: title?.slice(0, 200) || 'Festival',
        date: new Date(date),
        status: 'PROGRAMADA',
        effectiveUnits: 1.0,
        festivalRate: rate,
        reportedById: req.user.id,
        festivalProfessors: {
          create: [...new Set(professorIds)].map((professorId) => ({ professorId })),
        },
        makeupParticipants: {
          create: [...new Set(studentIds)].map((studentId) => ({ studentId })),
        },
      },
      include: festivalInclude(),
    });
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// Edit festival meta / roster / professors
router.put('/:id', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { date, title, ratePerProfessor, professorIds, studentIds } = req.body;

    const existing = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.kind !== 'FESTIVAL') {
      return res.status(404).json({ success: false, error: 'Festival no encontrado' });
    }

    const data = {};
    if (date !== undefined) data.date = new Date(date);
    if (title !== undefined) data.title = title?.slice(0, 200) || 'Festival';
    if (ratePerProfessor !== undefined) {
      const rate = parseFloat(ratePerProfessor);
      if (!rate || rate <= 0) return res.status(400).json({ success: false, error: 'Pago por profesor inválido' });
      data.festivalRate = rate;
    }

    if (Array.isArray(professorIds)) {
      if (professorIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Asigna al menos un profesor participante' });
      }
      await prisma.festivalProfessor.deleteMany({ where: { sessionId: req.params.id } });
      await prisma.festivalProfessor.createMany({
        data: [...new Set(professorIds)].map((professorId) => ({ sessionId: req.params.id, professorId })),
      });
    }

    if (Array.isArray(studentIds)) {
      if (studentIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Inscribe al menos un estudiante' });
      }
      await prisma.makeupParticipant.deleteMany({ where: { sessionId: req.params.id } });
      await prisma.makeupParticipant.createMany({
        data: [...new Set(studentIds)].map((studentId) => ({ sessionId: req.params.id, studentId })),
      });
    }

    const session = await prisma.classSession.update({
      where: { id: req.params.id },
      data,
      include: festivalInclude(),
    });

    if (['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) {
      await calculateCosts(req.params.id);
    }

    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const existing = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.kind !== 'FESTIVAL') {
      return res.status(404).json({ success: false, error: 'Festival no encontrado' });
    }
    await prisma.costRecord.deleteMany({ where: { sessionId: req.params.id } });
    await prisma.attendanceRecord.deleteMany({ where: { sessionId: req.params.id } });
    await prisma.sessionEditLog.deleteMany({ where: { sessionId: req.params.id } });
    await prisma.makeupParticipant.deleteMany({ where: { sessionId: req.params.id } });
    await prisma.festivalProfessor.deleteMany({ where: { sessionId: req.params.id } });
    await prisma.classSession.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { message: 'Festival eliminado' } });
  } catch (err) {
    next(err);
  }
});

// Report festival attendance. P and A both count as a class for the student
// (they consume from the package); J is omitted — see costEngine/attendanceStats.
router.post('/:id/finalize', async (req, res, next) => {
  try {
    const { attendanceRecords } = req.body;

    if (attendanceRecords !== undefined && !Array.isArray(attendanceRecords)) {
      return res.status(400).json({ success: false, error: 'attendanceRecords debe ser una lista' });
    }
    for (const record of attendanceRecords || []) {
      if (!record.studentId || !VALID_STATUSES.includes(record.status)) {
        return res.status(400).json({ success: false, error: 'Registro de asistencia inválido' });
      }
    }

    const session = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!session || session.kind !== 'FESTIVAL') {
      return res.status(404).json({ success: false, error: 'Festival no encontrado' });
    }
    if (!(await canReportFestival(req.user, session))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para reportar este festival' });
    }

    const isEdit = ['REALIZADA', 'CANCELADA_MITAD'].includes(session.status);
    let previousState = null;
    if (isEdit) {
      const prevRecords = await prisma.attendanceRecord.findMany({
        where: { sessionId: req.params.id },
        include: { student: { select: { name: true } } },
      });
      previousState = {
        status: session.status,
        records: prevRecords.map((r) => ({
          studentId: r.studentId,
          name: r.student?.name,
          status: r.status,
          justification: r.justification,
        })),
      };
    }

    const newRecords = (attendanceRecords || []).map((record) => ({
      sessionId: req.params.id,
      studentId: record.studentId,
      status: record.status,
      attendanceType: 'REGULAR',
      justification: record.justification?.slice(0, 500) || null,
      reportedById: req.user.id,
    }));
    await prisma.attendanceRecord.deleteMany({ where: { sessionId: req.params.id } });
    if (newRecords.length > 0) {
      await prisma.attendanceRecord.createMany({ data: newRecords });
    }

    const sessionData = { status: 'REALIZADA', reportedById: req.user.id };
    if (!session.firstReportedAt) sessionData.firstReportedAt = new Date();
    await prisma.classSession.update({ where: { id: req.params.id }, data: sessionData });

    if (isEdit) {
      await prisma.sessionEditLog.create({
        data: {
          sessionId: req.params.id,
          editedById: req.user.id,
          previousState,
          newState: {
            status: 'REALIZADA',
            records: newRecords.map(({ studentId, status, justification }) => ({
              studentId, status, justification,
            })),
          },
        },
      });
    }

    const costs = await calculateCosts(req.params.id);
    const updated = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: festivalInclude(),
    });
    res.json({ success: true, data: { session: updated, costs } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const { cancellationCategory, cancellationReason } = req.body;
    if (!CANCEL_CATEGORIES.includes(cancellationCategory)) {
      return res.status(400).json({ success: false, error: 'Categoría de cancelación requerida (LLUVIA, SIN_ESTUDIANTES u OTRA)' });
    }
    if (cancellationCategory === 'OTRA' && (!cancellationReason || !cancellationReason.trim())) {
      return res.status(400).json({ success: false, error: 'Describe el motivo de la cancelación' });
    }
    const session = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!session || session.kind !== 'FESTIVAL') {
      return res.status(404).json({ success: false, error: 'Festival no encontrado' });
    }
    if (!(await canReportFestival(req.user, session))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para cancelar este festival' });
    }

    const reasonText = (cancellationReason && cancellationReason.trim())
      ? cancellationReason.trim().slice(0, 500)
      : CANCEL_AUTO_TEXT[cancellationCategory];
    const updated = await prisma.classSession.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELADA',
        cancellationCategory,
        cancellationReason: reasonText,
        reportedById: req.user.id,
      },
    });
    await prisma.costRecord.deleteMany({ where: { sessionId: req.params.id } });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
