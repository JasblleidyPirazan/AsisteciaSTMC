const express = require('express');
const prisma = require('../lib/prisma');
const { calculateCosts } = require('../services/costEngine');
const { consolidateSession } = require('../services/consolidation');
const { isSessionPeriodLocked } = require('../lib/payrollLock');

const router = express.Router();

const LOCKED_MSG = 'La quincena de esta clase está cerrada. Reábrela en Liquidación para poder editar.';

const VALID_STATUSES = ['PRESENTE', 'AUSENTE', 'JUSTIFICADA'];
const VALID_TYPES = ['REGULAR', 'REPOSICION'];
const CANCEL_CATEGORIES = ['LLUVIA', 'SIN_ESTUDIANTES', 'OTRA'];
const CANCEL_AUTO_TEXT = {
  LLUVIA: 'Cancelada por lluvia',
  SIN_ESTUDIANTES: 'No llegaron estudiantes',
};

/**
 * Authorization for reporting attendance on a group (dual-report model):
 * - SUPERADMIN: any group (edits either report)
 * - PHYSICAL_TRAINER (coordinador): any group (writes the COORDINATOR report)
 * - TEACHER: only their own group (writes the PROFESSOR report)
 * - ADMIN: read-only — cannot report/edit (uses the reports views instead)
 * - PARENT / ASSISTANT: not allowed
 */
async function canReportGroup(user, groupId) {
  if (['SUPERADMIN', 'PHYSICAL_TRAINER'].includes(user.role)) return true;

  if (user.role === 'TEACHER') {
    const professor = await prisma.professor.findUnique({ where: { userId: user.id } });
    if (!professor) return false;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    return !!group && group.professorId === professor.id;
  }

  return false;
}

// Which staging report a user writes. TEACHER → PROFESSOR, PHYSICAL_TRAINER
// (coordinador) → COORDINATOR. SUPERADMIN edits either and must say which.
function resolveReporterType(role, requested) {
  if (role === 'TEACHER') return 'PROFESSOR';
  if (role === 'PHYSICAL_TRAINER') return 'COORDINATOR';
  if (role === 'SUPERADMIN' && ['PROFESSOR', 'COORDINATOR'].includes(requested)) return requested;
  return null;
}

// Resuelve el asistente que actúa. ADMIN/SUPERADMIN actúan a nombre de otro
// (por `assistantId` del body); cualquier otro usuario se resuelve por su enlace
// a un Assistant — así un profesor que TAMBIÉN es asistente (rol dual) puede
// marcar acompañamiento. Devuelve null si no hay asistente habilitado.
async function resolveActingAssistant(req) {
  if (['ADMIN', 'SUPERADMIN'].includes(req.user.role)) {
    return req.body.assistantId
      ? prisma.assistant.findUnique({ where: { id: req.body.assistantId } })
      : null;
  }
  return prisma.assistant.findUnique({ where: { userId: req.user.id } });
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
        // Staging reports so the flow can preload the caller's own draft when editing
        reports: { include: { attendance: { include: { student: { select: { name: true } } } } } },
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
        // Reportes de staging (para marcar "ya reporté" por rol) + consolidación
        reports: { select: { reporterType: true } },
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

// Finalize session: save THIS reporter's staging report, then consolidate.
// Under the dual-report model the professor and the coordinator each submit an
// independent report; the cost engine only runs once both coincide.
router.post('/:id/finalize', async (req, res, next) => {
  try {
    const { attendanceRecords, substituteProfessorId, assistantId, dictatedByOwner, notDictatedNote } = req.body;

    if (attendanceRecords !== undefined && !Array.isArray(attendanceRecords)) {
      return res.status(400).json({ success: false, error: 'attendanceRecords debe ser una lista' });
    }
    // "No dicté la clase yo": exige quién la dictó y una observación obligatoria
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

    // Validar la entrada (tipo de reporte) antes de consultar el candado de la
    // quincena: es más barato y evita cálculos de fecha sobre datos inválidos.
    const reporterType = resolveReporterType(req.user.role, req.body.reporterType);
    if (!reporterType) {
      return res.status(400).json({ success: false, error: 'Indica el tipo de reporte (profesor o coordinador)' });
    }

    if (await isSessionPeriodLocked(session.date)) {
      return res.status(409).json({ success: false, error: LOCKED_MSG });
    }

    // Editing an existing report of this type snapshots the previous version.
    const prevReport = await prisma.classReport.findUnique({
      where: { sessionId_reporterType: { sessionId: req.params.id, reporterType } },
      include: { attendance: { include: { student: { select: { name: true } } } } },
    });

    const dictatingProfessorId = dictatedByOwner === false ? substituteProfessorId : null;
    const report = await prisma.classReport.upsert({
      where: { sessionId_reporterType: { sessionId: req.params.id, reporterType } },
      update: {
        reportedById: req.user.id,
        dictatedByOwner: dictatedByOwner !== false,
        dictatingProfessorId,
        notDictatedNote: dictatedByOwner === false ? notDictatedNote.trim().slice(0, 500) : null,
        assistantId: assistantId || null,
      },
      create: {
        sessionId: req.params.id,
        reporterType,
        reportedById: req.user.id,
        dictatedByOwner: dictatedByOwner !== false,
        dictatingProfessorId,
        notDictatedNote: dictatedByOwner === false ? notDictatedNote.trim().slice(0, 500) : null,
        assistantId: assistantId || null,
      },
    });

    // Replace this report's attendance rows so the latest submission wins.
    const rows = (attendanceRecords || []).map((record) => ({
      classReportId: report.id,
      studentId: record.studentId,
      status: record.status,
      attendanceType: record.attendanceType || 'REGULAR',
      justification: record.justification?.slice(0, 500) || null,
    }));
    await prisma.classReportAttendance.deleteMany({ where: { classReportId: report.id } });
    if (rows.length > 0) {
      await prisma.classReportAttendance.createMany({ data: rows });
    }

    // First report of the class (either role) stamps firstReportedAt for the
    // late-report suspension rule; later edits never re-stamp it.
    if (!session.firstReportedAt) {
      await prisma.classSession.update({
        where: { id: req.params.id },
        data: { firstReportedAt: new Date(), reportedById: req.user.id },
      });
    }

    if (prevReport) {
      await prisma.sessionEditLog.create({
        data: {
          sessionId: req.params.id,
          editedById: req.user.id,
          previousState: {
            reporterType,
            dictatedByOwner: prevReport.dictatedByOwner,
            notDictatedNote: prevReport.notDictatedNote,
            records: prevReport.attendance.map((r) => ({
              studentId: r.studentId, name: r.student?.name, status: r.status,
              attendanceType: r.attendanceType, justification: r.justification,
            })),
          },
          newState: {
            reporterType,
            dictatedByOwner: dictatedByOwner !== false,
            notDictatedNote: dictatedByOwner === false ? notDictatedNote.trim().slice(0, 500) : null,
            records: rows.map(({ studentId, status, attendanceType, justification }) => ({
              studentId, status, attendanceType, justification,
            })),
          },
        },
      });
    }

    // Recompute consolidation: MATCHED writes the final records + runs costs.
    const consolidation = await consolidateSession(req.params.id);

    const updated = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: {
        attendanceRecords: { include: { student: true } },
        costRecords: true,
        reports: { include: { attendance: true } },
      },
    });

    res.json({ success: true, data: { session: updated, consolidation } });
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

    if (await isSessionPeriodLocked(existing.date)) {
      return res.status(409).json({ success: false, error: LOCKED_MSG });
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
    if (!['SUPERADMIN', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Solo el administrador puede desbloquear pagos' });
    }
    const session = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!session) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    if (await isSessionPeriodLocked(session.date)) {
      return res.status(409).json({ success: false, error: LOCKED_MSG });
    }

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

// Assistant confirms a class they accompanied.
// Assistant reports (or corrects) their accompaniment by GROUP + DATE, WITHOUT
// needing the class to have been reported first by the professor/coordinator.
// If no session exists yet, it is created as PROGRAMADA carrying only the
// assistant's confirmation; the professor/coordinator reports later reuse it
// (upsert by groupId_date). `remove: true` corrects a mistake (un-confirms), and
// cleans up the auto-created empty session if nothing else was attached.
router.post('/assist', async (req, res, next) => {
  try {
    const { groupId, date, remove } = req.body;
    if (!groupId || !date) {
      return res.status(400).json({ success: false, error: 'groupId y date requeridos' });
    }

    const assistant = await resolveActingAssistant(req);
    if (!assistant) return res.status(403).json({ success: false, error: 'No estás habilitado como asistente' });

    let session = await prisma.classSession.findUnique({
      where: { groupId_date: { groupId, date: new Date(date) } },
    });

    if (remove) {
      if (!session || session.assistantConfirmedId !== assistant.id) {
        return res.status(200).json({ success: true, data: session || null });
      }
      // La quincena cerrada no se edita.
      if (await isSessionPeriodLocked(session.date)) {
        return res.status(409).json({ success: false, error: LOCKED_MSG });
      }
      session = await prisma.classSession.update({
        where: { id: session.id },
        data: { assistantConfirmedId: null, assistantConfirmedAt: null },
      });
      // Limpieza: si la sesión fue auto-creada por el asistente (PROGRAMADA, sin
      // reporte de profesor ni reportes de staging) y ya no la confirma nadie,
      // se elimina para no dejar sesiones huérfanas.
      if (session.status === 'PROGRAMADA' && !session.reportedById) {
        const reports = await prisma.classReport.count({ where: { sessionId: session.id } });
        if (reports === 0) {
          await prisma.classSession.delete({ where: { id: session.id } });
          return res.json({ success: true, data: null });
        }
      } else if (['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) {
        await calculateCosts(session.id);
      }
      return res.json({ success: true, data: session });
    }

    if (session && session.assistantConfirmedId && session.assistantConfirmedId !== assistant.id) {
      return res.status(409).json({ success: false, error: 'Otra persona ya está registrada como asistente de esta clase' });
    }
    if (session && (await isSessionPeriodLocked(session.date))) {
      return res.status(409).json({ success: false, error: LOCKED_MSG });
    }

    session = await prisma.classSession.upsert({
      where: { groupId_date: { groupId, date: new Date(date) } },
      create: {
        groupId,
        date: new Date(date),
        status: 'PROGRAMADA',
        effectiveUnits: 1.0,
        assistantConfirmedId: assistant.id,
        assistantConfirmedAt: new Date(),
      },
      update: {
        assistantConfirmedId: assistant.id,
        assistantConfirmedAt: new Date(),
      },
    });

    if (['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) {
      await calculateCosts(session.id);
    }
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// This writes assistantConfirmedId (the assistant's own report) — it does NOT
// touch assistantId, which is what the professor reported in the class flow.
// The assistant's pay only turns PAYABLE when both match AND the coordinator
// validates (triple coincidence, see costEngine).
router.post('/:id/assist', async (req, res, next) => {
  try {
    const assistant = await resolveActingAssistant(req);
    if (!assistant) return res.status(403).json({ success: false, error: 'No estás habilitado como asistente' });

    const existing = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    // remove: true → clear the confirmation (only if it belongs to this assistant)
    if (req.body.remove) {
      if (existing.assistantConfirmedId !== assistant.id) {
        return res.status(403).json({ success: false, error: 'La sesión no está confirmada por este asistente' });
      }
      const session = await prisma.classSession.update({
        where: { id: req.params.id },
        data: { assistantConfirmedId: null, assistantConfirmedAt: null },
      });
      if (['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) {
        await calculateCosts(req.params.id);
      }
      return res.json({ success: true, data: session });
    }

    const session = await prisma.classSession.update({
      where: { id: req.params.id },
      data: { assistantConfirmedId: assistant.id, assistantConfirmedAt: new Date() },
    });

    if (['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) {
      await calculateCosts(req.params.id);
    }

    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// Coordinator/admin validates (or un-validates) the assistant match of a session
router.post('/:id/validate-assistant', async (req, res, next) => {
  try {
    if (!['SUPERADMIN', 'ADMIN', 'PHYSICAL_TRAINER'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Solo el coordinador o el administrador pueden validar' });
    }
    const existing = await prisma.classSession.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    const confirm = req.body.confirm !== false;
    const session = await prisma.classSession.update({
      where: { id: req.params.id },
      data: confirm
        ? { coordinatorValidatedById: req.user.id, coordinatorValidatedAt: new Date() }
        : { coordinatorValidatedById: null, coordinatorValidatedAt: null },
    });

    if (['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) {
      await calculateCosts(req.params.id);
    }

    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// Validation queue for the coordinator: today's (or a date's) finalized
// sessions that involve an assistant, with the three-way match state.
// No money amounts here — the coordinator role doesn't see pay.
router.get('/validation-queue', async (req, res, next) => {
  try {
    if (!['SUPERADMIN', 'ADMIN', 'PHYSICAL_TRAINER'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
    }
    const { date, from, to } = req.query;
    const where = {
      status: { in: ['REALIZADA', 'CANCELADA_MITAD'] },
      OR: [
        { assistantId: { not: null } },
        { assistantConfirmedId: { not: null } },
      ],
    };
    if (date) where.date = new Date(date);
    else if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const sessions = await prisma.classSession.findMany({
      where,
      include: {
        group: { select: { id: true, code: true, professor: { select: { id: true, name: true } } } },
        makeupProfessor: { select: { id: true, name: true } },
        substituteProfessor: { select: { id: true, name: true } },
        assistant: { select: { id: true, name: true } },
        assistantConfirmed: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });

    const data = sessions.map((s) => {
      const professorReported = !!s.assistantId;      // el profesor registró un asistente
      const assistantConfirmed = !!s.assistantConfirmedId; // el asistente marcó su acompañamiento
      const matches = professorReported && s.assistantId === s.assistantConfirmedId;
      // Todo lo que coincide se valida automáticamente: en una clase regular
      // consolidada (MATCHED), profesor y coordinador ya coincidieron en el
      // asistente vía doble reporte — no se exige clic manual.
      const coordinatorOk = !!s.coordinatorValidatedAt ||
        (s.kind === 'REGULAR' && s.consolidationStatus === 'MATCHED');

      // Qué falta de la triple coincidencia (para el aviso). Códigos que el
      // frontend traduce a texto legible.
      const missing = [];
      if (!professorReported) missing.push('professor');
      if (!assistantConfirmed) missing.push('assistant');
      else if (!matches) missing.push('assistant_mismatch');
      if (!coordinatorOk) missing.push('coordinator');

      return {
        id: s.id,
        date: s.date,
        kind: s.kind,
        title: s.title,
        groupCode: s.group?.code || s.title,
        professor: s.substituteProfessor || s.group?.professor || s.makeupProfessor,
        dictatedByOwner: s.dictatedByOwner,
        notDictatedNote: s.notDictatedNote,
        assistantReported: s.assistant,        // lo que reportó el profesor
        assistantConfirmed: s.assistantConfirmed, // lo que confirmó el asistente
        coordinatorValidatedAt: s.coordinatorValidatedAt,
        matches,
        autoValidated: matches && coordinatorOk && !s.coordinatorValidatedAt,
        complete: matches && coordinatorOk,
        missing,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
