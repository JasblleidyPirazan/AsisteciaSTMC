const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { calculateCosts } = require('../services/costEngine');

const router = express.Router();

const VALID_STATUSES = ['PRESENTE', 'AUSENTE', 'JUSTIFICADA'];

/**
 * Who may report a makeup class:
 * - ADMIN / PHYSICAL_TRAINER: any makeup
 * - TEACHER: only makeups where they are the assigned professor or the substitute
 * (Assistants accompany via /sessions/:id/assist, same as regular classes.)
 */
async function canReportMakeup(user, session) {
  if (['ADMIN', 'PHYSICAL_TRAINER'].includes(user.role)) return true;
  if (user.role === 'TEACHER') {
    const professor = await prisma.professor.findUnique({ where: { userId: user.id } });
    if (!professor) return false;
    return session.makeupProfessorId === professor.id || session.substituteProfessorId === professor.id;
  }
  return false;
}

function makeupInclude() {
  return {
    makeupProfessor: { select: { id: true, name: true } },
    substituteProfessor: { select: { id: true, name: true } },
    assistant: { select: { id: true, name: true } },
    makeupParticipants: { include: { student: { select: { id: true, name: true } } } },
    attendanceRecords: { include: { student: { select: { id: true, name: true } } } },
  };
}

// List makeup classes (optionally filter by date / status)
router.get('/', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'TEACHER'), async (req, res, next) => {
  try {
    const { date, status, from, to } = req.query;
    const where = { kind: 'MAKEUP' };
    if (date) where.date = new Date(date);
    if (status) where.status = status;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    // Teachers only see makeups assigned to them
    if (req.user.role === 'TEACHER') {
      const professor = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      where.OR = [
        { makeupProfessorId: professor?.id || '__none__' },
        { substituteProfessorId: professor?.id || '__none__' },
      ];
    }

    const sessions = await prisma.classSession.findMany({
      where,
      include: makeupInclude(),
      orderBy: { date: 'desc' },
    });
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'TEACHER'), async (req, res, next) => {
  try {
    const session = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: makeupInclude(),
    });
    if (!session || session.kind !== 'MAKEUP') {
      return res.status(404).json({ success: false, error: 'Reposición no encontrada' });
    }
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// Create a makeup class — ADMIN / PHYSICAL_TRAINER
router.post('/', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { date, title, professorId, assistantId, countsAsUnits, studentIds } = req.body;

    if (!date) return res.status(400).json({ success: false, error: 'Fecha requerida' });
    if (!professorId) return res.status(400).json({ success: false, error: 'Profesor requerido' });

    const units = parseFloat(countsAsUnits);
    if (!units || units <= 0 || units > 10) {
      return res.status(400).json({ success: false, error: 'Debe definir por cuántas asistencias cuenta la clase (mayor a 0)' });
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Debe asignar al menos un estudiante' });
    }

    const professor = await prisma.professor.findUnique({ where: { id: professorId } });
    if (!professor) return res.status(404).json({ success: false, error: 'Profesor no encontrado' });

    const session = await prisma.classSession.create({
      data: {
        kind: 'MAKEUP',
        groupId: null,
        title: title?.slice(0, 200) || 'Reposición grupal',
        date: new Date(date),
        status: 'PROGRAMADA',
        effectiveUnits: units,
        makeupProfessorId: professorId,
        assistantId: assistantId || null,
        reportedById: req.user.id,
        makeupParticipants: {
          create: [...new Set(studentIds)].map((studentId) => ({ studentId })),
        },
      },
      include: makeupInclude(),
    });
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// Edit makeup meta (only while still scheduled) — ADMIN / PHYSICAL_TRAINER
router.put('/:id', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { date, title, professorId, assistantId, countsAsUnits, studentIds } = req.body;

    const existing = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.kind !== 'MAKEUP') {
      return res.status(404).json({ success: false, error: 'Reposición no encontrada' });
    }

    const data = {};
    if (date !== undefined) data.date = new Date(date);
    if (title !== undefined) data.title = title?.slice(0, 200) || 'Reposición grupal';
    if (professorId !== undefined) data.makeupProfessorId = professorId;
    if (assistantId !== undefined) data.assistantId = assistantId || null;
    if (countsAsUnits !== undefined) {
      const units = parseFloat(countsAsUnits);
      if (!units || units <= 0 || units > 10) {
        return res.status(400).json({ success: false, error: 'Valor de asistencias inválido' });
      }
      data.effectiveUnits = units;
    }

    if (Array.isArray(studentIds)) {
      if (studentIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Debe asignar al menos un estudiante' });
      }
      await prisma.makeupParticipant.deleteMany({ where: { sessionId: req.params.id } });
      await prisma.makeupParticipant.createMany({
        data: [...new Set(studentIds)].map((studentId) => ({ sessionId: req.params.id, studentId })),
      });
    }

    const session = await prisma.classSession.update({
      where: { id: req.params.id },
      data,
      include: makeupInclude(),
    });

    // If it was already reported, recalculate costs (participants/units may have changed)
    if (['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) {
      await calculateCosts(req.params.id);
    }

    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// Delete a makeup — ADMIN / PHYSICAL_TRAINER
router.delete('/:id', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const existing = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.kind !== 'MAKEUP') {
      return res.status(404).json({ success: false, error: 'Reposición no encontrada' });
    }
    await prisma.costRecord.deleteMany({ where: { sessionId: req.params.id } });
    await prisma.attendanceRecord.deleteMany({ where: { sessionId: req.params.id } });
    await prisma.sessionEditLog.deleteMany({ where: { sessionId: req.params.id } });
    await prisma.makeupParticipant.deleteMany({ where: { sessionId: req.params.id } });
    await prisma.classSession.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { message: 'Reposición eliminada' } });
  } catch (err) {
    next(err);
  }
});

// Report attendance for a makeup class (normal flow for prof/PF/admin)
router.post('/:id/finalize', async (req, res, next) => {
  try {
    const { attendanceRecords, substituteProfessorId, assistantId } = req.body;

    if (attendanceRecords !== undefined && !Array.isArray(attendanceRecords)) {
      return res.status(400).json({ success: false, error: 'attendanceRecords debe ser una lista' });
    }
    for (const record of attendanceRecords || []) {
      if (!record.studentId || !VALID_STATUSES.includes(record.status)) {
        return res.status(400).json({ success: false, error: 'Registro de asistencia inválido' });
      }
    }

    const session = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!session || session.kind !== 'MAKEUP') {
      return res.status(404).json({ success: false, error: 'Reposición no encontrada' });
    }
    if (!(await canReportMakeup(req.user, session))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para reportar esta reposición' });
    }

    // Re-finalizing is an edit: snapshot the previous state into an edit log
    const isEdit = ['REALIZADA', 'CANCELADA_MITAD'].includes(session.status);
    let previousState = null;
    if (isEdit) {
      const prevRecords = await prisma.attendanceRecord.findMany({
        where: { sessionId: req.params.id },
        include: { student: { select: { name: true } } },
      });
      previousState = {
        status: session.status,
        effectiveUnits: parseFloat(session.effectiveUnits),
        records: prevRecords.map((r) => ({
          studentId: r.studentId,
          name: r.student?.name,
          status: r.status,
          attendanceType: r.attendanceType,
          justification: r.justification,
        })),
      };
    }

    // Makeup participants are all regular attendees of this class (no group bracket
    // exception). effectiveUnits is the "counts-as" value defined at creation.
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
    if (substituteProfessorId !== undefined) sessionData.substituteProfessorId = substituteProfessorId || null;
    if (assistantId !== undefined) sessionData.assistantId = assistantId || null;

    await prisma.classSession.update({ where: { id: req.params.id }, data: sessionData });

    if (isEdit) {
      await prisma.sessionEditLog.create({
        data: {
          sessionId: req.params.id,
          editedById: req.user.id,
          previousState,
          newState: {
            status: 'REALIZADA',
            effectiveUnits: parseFloat(session.effectiveUnits),
            records: newRecords.map(({ studentId, status, justification }) => ({
              studentId, status, attendanceType: 'REGULAR', justification,
            })),
          },
        },
      });
    }

    const costs = await calculateCosts(req.params.id);
    const updated = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: makeupInclude(),
    });
    res.json({ success: true, data: { session: updated, costs } });
  } catch (err) {
    next(err);
  }
});

// Cancel a makeup
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const { cancellationReason } = req.body;
    if (!cancellationReason) {
      return res.status(400).json({ success: false, error: 'Motivo de cancelación requerido' });
    }
    const session = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!session || session.kind !== 'MAKEUP') {
      return res.status(404).json({ success: false, error: 'Reposición no encontrada' });
    }
    if (!(await canReportMakeup(req.user, session))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para cancelar esta reposición' });
    }

    const updated = await prisma.classSession.update({
      where: { id: req.params.id },
      data: { status: 'CANCELADA', cancellationReason: cancellationReason.slice(0, 500), reportedById: req.user.id },
    });
    await prisma.costRecord.deleteMany({ where: { sessionId: req.params.id } });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
