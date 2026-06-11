const express = require('express');
const prisma = require('../lib/prisma');
const { calculateCosts } = require('../services/costEngine');

const router = express.Router();

const VALID_STATUSES = ['PRESENTE', 'AUSENTE', 'JUSTIFICADA'];
const VALID_TYPES = ['REGULAR', 'REPOSICION'];

/**
 * Authorization for reporting attendance on a group:
 * - ADMIN / PHYSICAL_TRAINER: any group
 * - TEACHER: only groups where they are the titular professor
 * - PARENT: only groups where one of their children is enrolled
 * - ASSISTANT: not allowed (they use /:id/assist)
 */
async function canReportGroup(user, groupId) {
  if (['ADMIN', 'PHYSICAL_TRAINER'].includes(user.role)) return true;

  if (user.role === 'TEACHER') {
    const professor = await prisma.professor.findUnique({ where: { userId: user.id } });
    if (!professor) return false;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    return !!group && group.professorId === professor.id;
  }

  if (user.role === 'PARENT') {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { groupId, student: { parentUserId: user.id, active: true } },
    });
    return !!enrollment;
  }

  return false;
}

// Check if session exists for a group on a date
router.get('/check', async (req, res, next) => {
  try {
    const { groupId, date } = req.query;
    if (!groupId || !date) {
      return res.status(400).json({ success: false, error: 'groupId y date requeridos' });
    }
    const session = await prisma.classSession.findUnique({
      where: { groupId_date: { groupId, date: new Date(date) } },
      include: { attendanceRecords: { include: { student: true } } },
    });
    res.json({ success: true, data: { exists: !!session, session } });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { groupId, date, status } = req.query;
    const where = {};
    if (groupId) where.groupId = groupId;
    if (date) where.date = new Date(date);
    if (status) where.status = status;

    const sessions = await prisma.classSession.findMany({
      where,
      include: {
        group: { select: { id: true, code: true, name: true } },
        substituteProfessor: { select: { id: true, name: true } },
        assistant: { select: { id: true, name: true } },
        attendanceRecords: { include: { student: { select: { id: true, name: true } } } },
      },
      orderBy: { date: 'desc' },
    });
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
});

// Create a new session (marks class as started)
router.post('/', async (req, res, next) => {
  try {
    const { groupId, date, substituteProfessorId, assistantId } = req.body;
    if (!groupId || !date) {
      return res.status(400).json({ success: false, error: 'groupId y date requeridos' });
    }

    if (!(await canReportGroup(req.user, groupId))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para reportar este grupo' });
    }

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ success: false, error: 'Grupo no encontrado' });

    const session = await prisma.classSession.upsert({
      where: { groupId_date: { groupId, date: new Date(date) } },
      update: {
        substituteProfessorId: substituteProfessorId || null,
        assistantId: assistantId || null,
        reportedById: req.user.id,
      },
      create: {
        groupId,
        date: new Date(date),
        status: 'PROGRAMADA',
        effectiveUnits: group.classUnits,
        substituteProfessorId: substituteProfessorId || null,
        assistantId: assistantId || null,
        reportedById: req.user.id,
      },
      include: {
        group: { include: { professor: true } },
        substituteProfessor: true,
        assistant: true,
      },
    });
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// Finalize session: save attendance + run cost engine
router.post('/:id/finalize', async (req, res, next) => {
  try {
    const { attendanceRecords, cancelledHalf } = req.body;

    if (attendanceRecords !== undefined && !Array.isArray(attendanceRecords)) {
      return res.status(400).json({ success: false, error: 'attendanceRecords debe ser una lista' });
    }
    for (const record of attendanceRecords || []) {
      if (!record.studentId || !VALID_STATUSES.includes(record.status)) {
        return res.status(400).json({ success: false, error: 'Registro de asistencia inválido' });
      }
      if (record.attendanceType && !VALID_TYPES.includes(record.attendanceType)) {
        return res.status(400).json({ success: false, error: 'Tipo de asistencia inválido' });
      }
    }

    const session = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: { group: true },
    });
    if (!session) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    if (!(await canReportGroup(req.user, session.groupId))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para reportar este grupo' });
    }

    if (session.status === 'REALIZADA' || session.status === 'CANCELADA_MITAD') {
      return res.status(409).json({ success: false, error: 'Sesión ya finalizada' });
    }

    let effectiveUnits = parseFloat(session.group.classUnits);
    let status = 'REALIZADA';
    if (cancelledHalf && effectiveUnits === 2.0) {
      effectiveUnits = 1.0;
      status = 'CANCELADA_MITAD';
    }

    // Upsert attendance records
    for (const record of attendanceRecords || []) {
      await prisma.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId: req.params.id, studentId: record.studentId } },
        update: {
          status: record.status,
          attendanceType: record.attendanceType || 'REGULAR',
          justification: record.justification?.slice(0, 500) || null,
          reportedById: req.user.id,
        },
        create: {
          sessionId: req.params.id,
          studentId: record.studentId,
          status: record.status,
          attendanceType: record.attendanceType || 'REGULAR',
          justification: record.justification?.slice(0, 500) || null,
          reportedById: req.user.id,
        },
      });
    }

    await prisma.classSession.update({
      where: { id: req.params.id },
      data: { status, effectiveUnits, reportedById: req.user.id },
    });

    const costs = await calculateCosts(req.params.id);

    const updated = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: {
        attendanceRecords: { include: { student: true } },
        costRecords: true,
      },
    });

    res.json({ success: true, data: { session: updated, costs } });
  } catch (err) {
    next(err);
  }
});

// Cancel a session
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const { cancellationReason } = req.body;
    if (!cancellationReason) {
      return res.status(400).json({ success: false, error: 'Motivo de cancelación requerido' });
    }

    const existing = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    if (!(await canReportGroup(req.user, existing.groupId))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para reportar este grupo' });
    }

    const session = await prisma.classSession.update({
      where: { id: req.params.id },
      data: { status: 'CANCELADA', cancellationReason: cancellationReason.slice(0, 500), reportedById: req.user.id },
    });
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// Assistant marks classes they accompanied
router.post('/:id/assist', async (req, res, next) => {
  try {
    if (!['ADMIN', 'ASSISTANT'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Solo asistentes pueden usar este endpoint' });
    }

    const assistant = req.user.role === 'ASSISTANT'
      ? await prisma.assistant.findUnique({ where: { userId: req.user.id } })
      : await prisma.assistant.findUnique({ where: { id: req.body.assistantId } });

    if (!assistant) return res.status(404).json({ success: false, error: 'Asistente no encontrado' });

    const session = await prisma.classSession.update({
      where: { id: req.params.id },
      data: { assistantId: assistant.id },
    });

    if (['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) {
      await calculateCosts(req.params.id);
    }

    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
