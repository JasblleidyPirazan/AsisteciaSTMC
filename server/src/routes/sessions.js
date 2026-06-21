const express = require('express');
const prisma = require('../lib/prisma');
const { calculateCosts } = require('../services/costEngine');
const { computeDiff, hasConflict } = require('../utils/conflictUtils');

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
    const where = { kind: kind || 'REGULAR' };
    if (groupId) where.groupId = groupId;
    if (date) where.date = new Date(date);
    if (status) where.status = status;

    // TEACHER: only show sessions from their own groups
    if (req.user.role === 'TEACHER') {
      const professor = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      if (professor) {
        const groups = await prisma.group.findMany({
          where: { professorId: professor.id, active: true },
          select: { id: true },
        });
        where.groupId = { in: groups.map((g) => g.id) };
      } else {
        where.groupId = '__none__';
      }
    }

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
    const { attendanceRecords, cancelledHalf, substituteProfessorId, assistantId } = req.body;

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

    // Block finalization when a conflict is pending — must resolve first
    if (session.status === 'EN_REVISION') {
      return res.status(409).json({
        success: false,
        conflict: true,
        error: 'La clase tiene un conflicto de reportes pendiente. Resuélvelo antes de continuar.',
      });
    }

    // Re-finalizing an already-finalized session is an EDIT: we snapshot the
    // previous state and the new report becomes authoritative.
    const isEdit = ['REALIZADA', 'CANCELADA_MITAD'].includes(session.status);
    let previousState = null;
    let prevRecords = [];
    if (isEdit) {
      prevRecords = await prisma.attendanceRecord.findMany({
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

    let effectiveUnits = parseFloat(session.group.classUnits);
    let status = 'REALIZADA';
    if (cancelledHalf && effectiveUnits === 2.0) {
      effectiveUnits = 1.0;
      status = 'CANCELADA_MITAD';
    }

    const newRecords = (attendanceRecords || []).map((record) => ({
      sessionId: req.params.id,
      studentId: record.studentId,
      status: record.status,
      attendanceType: record.attendanceType || 'REGULAR',
      justification: record.justification?.slice(0, 500) || null,
      reportedById: req.user.id,
    }));

    // Conflict detection: a different user re-finalizing with different data
    const isDifferentReporter = isEdit && session.reportedById && session.reportedById !== req.user.id;
    if (isDifferentReporter) {
      // Build a name map so the challenger snapshot is human-readable
      const nameMap = new Map(prevRecords.map((r) => [r.studentId, r.student?.name]));
      const unknownIds = newRecords.map((r) => r.studentId).filter((id) => !nameMap.has(id));
      if (unknownIds.length > 0) {
        const extras = await prisma.student.findMany({
          where: { id: { in: unknownIds } },
          select: { id: true, name: true },
        });
        extras.forEach((s) => nameMap.set(s.id, s.name));
      }

      const challengerSnap = newRecords.map((r) => ({
        studentId: r.studentId,
        name: nameMap.get(r.studentId) || r.studentId,
        status: r.status,
        attendanceType: r.attendanceType || 'REGULAR',
        justification: r.justification || null,
      }));

      const diff = computeDiff(previousState.records, challengerSnap);

      if (hasConflict(diff)) {
        await prisma.attendanceConflict.upsert({
          where: { sessionId: req.params.id },
          create: {
            sessionId: req.params.id,
            canonicalById: session.reportedById,
            challengerById: req.user.id,
            canonicalRecords: previousState.records,
            challengerRecords: challengerSnap,
            diffSummary: diff,
          },
          update: {
            challengerById: req.user.id,
            canonicalRecords: previousState.records,
            challengerRecords: challengerSnap,
            diffSummary: diff,
            resolvedById: null,
            resolvedAt: null,
          },
        });
        await prisma.classSession.update({
          where: { id: req.params.id },
          data: { status: 'EN_REVISION' },
        });
        return res.status(409).json({
          success: false,
          conflict: true,
          error: 'Reporte con diferencias detectadas. La clase queda en revisión.',
          data: { sessionId: req.params.id, diff },
        });
      }
      // Different reporter but data matches → proceed as normal edit (no conflict)
    }

    await prisma.attendanceRecord.deleteMany({ where: { sessionId: req.params.id } });
    if (newRecords.length > 0) {
      await prisma.attendanceRecord.createMany({ data: newRecords });
    }

    const sessionData = { status, effectiveUnits, reportedById: req.user.id };
    if (substituteProfessorId !== undefined) sessionData.substituteProfessorId = substituteProfessorId || null;
    if (assistantId !== undefined) sessionData.assistantId = assistantId || null;

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

// View the active conflict for a session
router.get('/:id/conflict', async (req, res, next) => {
  try {
    const { role } = req.user;
    if (!['ADMIN', 'PHYSICAL_TRAINER', 'TEACHER'].includes(role)) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para ver este conflicto' });
    }

    const session = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: {
        group: { include: { professor: { select: { id: true, name: true } } } },
        substituteProfessor: { select: { id: true, name: true } },
        assistant: { select: { id: true, name: true } },
        conflict: {
          include: {
            canonicalBy:  { select: { id: true, email: true, role: true } },
            challengerBy: { select: { id: true, email: true, role: true } },
            resolvedBy:   { select: { id: true, email: true } },
          },
        },
      },
    });

    if (!session) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    if (session.status !== 'EN_REVISION' || !session.conflict) {
      return res.status(404).json({ success: false, error: 'No hay conflicto activo para esta sesión' });
    }

    if (role === 'TEACHER' && !(await canReportGroup(req.user, session.groupId))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para ver este conflicto' });
    }

    res.json({ success: true, data: { session, conflict: session.conflict } });
  } catch (err) {
    next(err);
  }
});

// Resolve an active conflict — ADMIN, PHYSICAL_TRAINER, or TEACHER (own group)
router.post('/:id/resolve', async (req, res, next) => {
  try {
    const { accept, records: customRecords } = req.body;

    if (!['canonical', 'challenger', 'custom'].includes(accept)) {
      return res.status(400).json({ success: false, error: 'accept debe ser canonical, challenger o custom' });
    }
    if (accept === 'custom' && (!Array.isArray(customRecords) || customRecords.length === 0)) {
      return res.status(400).json({ success: false, error: 'records requeridos para resolución custom' });
    }

    const session = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: { conflict: true, group: true },
    });

    if (!session) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    if (session.status !== 'EN_REVISION' || !session.conflict) {
      return res.status(400).json({ success: false, error: 'La sesión no tiene un conflicto pendiente' });
    }

    const { role } = req.user;
    if (!['ADMIN', 'PHYSICAL_TRAINER', 'TEACHER'].includes(role)) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para resolver este conflicto' });
    }
    if (role === 'TEACHER' && !(await canReportGroup(req.user, session.groupId))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para resolver este conflicto' });
    }

    // Choose which records to apply
    let sourceRecords;
    if (accept === 'canonical') {
      sourceRecords = session.conflict.canonicalRecords;
    } else if (accept === 'challenger') {
      sourceRecords = session.conflict.challengerRecords;
    } else {
      for (const r of customRecords) {
        if (!r.studentId || !VALID_STATUSES.includes(r.status)) {
          return res.status(400).json({ success: false, error: 'Registro de resolución inválido' });
        }
      }
      sourceRecords = customRecords;
    }

    // Snapshot current state for the edit log
    const currentRecords = await prisma.attendanceRecord.findMany({
      where: { sessionId: req.params.id },
      include: { student: { select: { name: true } } },
    });
    const previousStateForLog = {
      status: 'EN_REVISION',
      effectiveUnits: parseFloat(session.effectiveUnits),
      records: currentRecords.map((r) => ({
        studentId: r.studentId,
        name: r.student?.name,
        status: r.status,
        attendanceType: r.attendanceType,
        justification: r.justification,
      })),
    };

    // Apply the chosen records
    const finalRows = sourceRecords.map((r) => ({
      sessionId: req.params.id,
      studentId: r.studentId,
      status: r.status,
      attendanceType: r.attendanceType || 'REGULAR',
      justification: r.justification || null,
      reportedById: req.user.id,
    }));

    await prisma.attendanceRecord.deleteMany({ where: { sessionId: req.params.id } });
    if (finalRows.length > 0) {
      await prisma.attendanceRecord.createMany({ data: finalRows });
    }

    // Mark conflict resolved (keep record for history)
    await prisma.attendanceConflict.update({
      where: { sessionId: req.params.id },
      data: { resolvedById: req.user.id, resolvedAt: new Date() },
    });

    // Restore session to REALIZADA
    await prisma.classSession.update({
      where: { id: req.params.id },
      data: { status: 'REALIZADA', reportedById: req.user.id },
    });

    // Audit log
    await prisma.sessionEditLog.create({
      data: {
        sessionId: req.params.id,
        editedById: req.user.id,
        previousState: previousStateForLog,
        newState: {
          status: 'REALIZADA',
          effectiveUnits: parseFloat(session.effectiveUnits),
          resolvedConflict: accept,
          records: finalRows.map(({ studentId, status, attendanceType, justification }) => ({
            studentId, status, attendanceType, justification,
          })),
        },
      },
    });

    const costs = await calculateCosts(req.params.id);

    const updated = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: {
        attendanceRecords: { include: { student: { select: { id: true, name: true } } } },
        costRecords: true,
        conflict: true,
      },
    });

    res.json({ success: true, data: { session: updated, costs } });
  } catch (err) {
    next(err);
  }
});

// Cancel a session
const VALID_CANCEL_TYPES = ['LLUVIA', 'FESTIVO', 'MANTENIMIENTO', 'EMERGENCIA', 'OTRO'];

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const { cancellationReason, cancellationType } = req.body;
    if (!cancellationReason && !cancellationType) {
      return res.status(400).json({ success: false, error: 'Motivo de cancelación requerido' });
    }
    if (cancellationType && !VALID_CANCEL_TYPES.includes(cancellationType)) {
      return res.status(400).json({ success: false, error: 'Tipo de cancelación inválido' });
    }

    const existing = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    if (!(await canReportGroup(req.user, existing.groupId))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para reportar este grupo' });
    }

    const session = await prisma.classSession.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELADA',
        cancellationReason: cancellationReason?.slice(0, 500) || null,
        cancellationType: cancellationType || null,
        reportedById: req.user.id,
      },
    });

    await prisma.costRecord.deleteMany({ where: { sessionId: req.params.id } });

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

    const existing = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

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
