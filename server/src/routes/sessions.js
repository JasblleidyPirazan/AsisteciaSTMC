const express = require('express');
const prisma = require('../lib/prisma');
const { calculateCosts } = require('../services/costEngine');

const router = express.Router();

const VALID_STATUSES = ['PRESENTE', 'AUSENTE', 'JUSTIFICADA'];
const VALID_TYPES = ['REGULAR', 'REPOSICION'];
const CANCEL_CATEGORIES = ['LLUVIA', 'SIN_ESTUDIANTES', 'OTRA'];
const CANCEL_AUTO_TEXT = {
  LLUVIA: 'Cancelada por lluvia',
  SIN_ESTUDIANTES: 'No llegaron estudiantes',
};

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
      include: {
        attendanceRecords: { include: { student: true } },
        substituteProfessor: { select: { id: true, name: true } },
        assistant: { select: { id: true, name: true } },
      },
    });
    res.json({ success: true, data: { exists: !!session, session } });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { groupId, date, status, kind } = req.query;
    // Default to regular sessions only; makeups have their own endpoints/views
    const where = { kind: kind || 'REGULAR' };
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
        effectiveUnits: 1.0,
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
    const { attendanceRecords, substituteProfessorId, assistantId, dictatedByOwner, notDictatedNote } = req.body;

    if (attendanceRecords !== undefined && !Array.isArray(attendanceRecords)) {
      return res.status(400).json({ success: false, error: 'attendanceRecords debe ser una lista' });
    }
    // "No dicté la clase yo": la asistencia se registra igual, pero exige
    // quién la dictó y una observación obligatoria (queda para el coordinador)
    if (dictatedByOwner === false) {
      if (!notDictatedNote || !notDictatedNote.trim()) {
        return res.status(400).json({ success: false, error: 'La observación es obligatoria cuando la clase no fue dictada por el profesor titular' });
      }
      if (!substituteProfessorId) {
        return res.status(400).json({ success: false, error: 'Indica quién dictó la clase' });
      }
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

    // Re-finalizing an already-finalized session is an EDIT: we snapshot the
    // previous state into an edit log and the new report becomes authoritative.
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
        dictatedByOwner: session.dictatedByOwner,
        notDictatedNote: session.notDictatedNote,
        records: prevRecords.map((r) => ({
          studentId: r.studentId,
          name: r.student?.name,
          status: r.status,
          attendanceType: r.attendanceType,
          justification: r.justification,
        })),
      };
    }

    // Every class counts as a single unit (double groups were removed).
    const effectiveUnits = 1.0;
    const status = 'REALIZADA';

    // Replace all attendance records so the latest report is the single source
    // of truth (an edit can also remove a reposition student, for example)
    const newRecords = (attendanceRecords || []).map((record) => ({
      sessionId: req.params.id,
      studentId: record.studentId,
      status: record.status,
      attendanceType: record.attendanceType || 'REGULAR',
      justification: record.justification?.slice(0, 500) || null,
      reportedById: req.user.id,
    }));
    await prisma.attendanceRecord.deleteMany({ where: { sessionId: req.params.id } });
    if (newRecords.length > 0) {
      await prisma.attendanceRecord.createMany({ data: newRecords });
    }

    // Persist who actually dictated/accompanied the class. Step 2 of the flow
    // selects these AFTER the session is created, so finalize must save them.
    const sessionData = { status, effectiveUnits, reportedById: req.user.id };
    if (substituteProfessorId !== undefined) sessionData.substituteProfessorId = substituteProfessorId || null;
    if (assistantId !== undefined) sessionData.assistantId = assistantId || null;
    // Only the FIRST report stamps firstReportedAt — later edits never
    // re-suspend a report that was made on time (regla de pago suspendido)
    if (!session.firstReportedAt) sessionData.firstReportedAt = new Date();
    if (dictatedByOwner !== undefined) {
      sessionData.dictatedByOwner = dictatedByOwner !== false;
      sessionData.notDictatedNote = dictatedByOwner === false
        ? notDictatedNote.trim().slice(0, 500)
        : null;
    }

    await prisma.classSession.update({
      where: { id: req.params.id },
      data: sessionData,
    });

    if (isEdit) {
      await prisma.sessionEditLog.create({
        data: {
          sessionId: req.params.id,
          editedById: req.user.id,
          previousState,
          newState: {
            status,
            effectiveUnits,
            dictatedByOwner: dictatedByOwner !== false,
            notDictatedNote: dictatedByOwner === false ? notDictatedNote.trim().slice(0, 500) : null,
            records: newRecords.map(({ studentId, status: st, attendanceType, justification }) => ({
              studentId, status: st, attendanceType, justification,
            })),
          },
        },
      });
    }

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
    const { cancellationCategory, cancellationReason } = req.body;
    if (!CANCEL_CATEGORIES.includes(cancellationCategory)) {
      return res.status(400).json({ success: false, error: 'Categoría de cancelación requerida (LLUVIA, SIN_ESTUDIANTES u OTRA)' });
    }
    if (cancellationCategory === 'OTRA' && (!cancellationReason || !cancellationReason.trim())) {
      return res.status(400).json({ success: false, error: 'Describe el motivo de la cancelación' });
    }

    const existing = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    if (!(await canReportGroup(req.user, existing.groupId))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para reportar este grupo' });
    }

    const reasonText = (cancellationReason && cancellationReason.trim())
      ? cancellationReason.trim().slice(0, 500)
      : CANCEL_AUTO_TEXT[cancellationCategory];
    const session = await prisma.classSession.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELADA',
        cancellationCategory,
        cancellationReason: reasonText,
        reportedById: req.user.id,
      },
    });

    // If the session had been finalized before, its cost records no longer apply
    await prisma.costRecord.deleteMany({ where: { sessionId: req.params.id } });

    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// Unlock the pay of a late-reported class — ONLY the admin can do this
router.post('/:id/unlock-payment', async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Solo el administrador puede desbloquear pagos' });
    }
    const session = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!session) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    await prisma.classSession.update({
      where: { id: req.params.id },
      data: { paymentUnlockedById: req.user.id, paymentUnlockedAt: new Date() },
    });
    await calculateCosts(req.params.id);

    res.json({ success: true, data: { message: 'Pago desbloqueado' } });
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

    const existing = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    // remove: true → unmark (only if the session is marked with this assistant)
    if (req.body.remove) {
      if (existing.assistantId !== assistant.id) {
        return res.status(403).json({ success: false, error: 'La sesión no está marcada con este asistente' });
      }
      const session = await prisma.classSession.update({
        where: { id: req.params.id },
        data: { assistantId: null },
      });
      if (['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) {
        await calculateCosts(req.params.id);
      }
      return res.json({ success: true, data: session });
    }

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
