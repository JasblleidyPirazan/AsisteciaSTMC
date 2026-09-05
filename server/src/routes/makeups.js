const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { consolidateSession, resolveReporterType, backfillLegacyReport } = require('../services/consolidation');
const { calculateCosts } = require('../services/costEngine');
const { attachStudentStatus } = require('../services/studentStatus');
const { isSessionPeriodLocked } = require('../lib/payrollLock');

const router = express.Router();

const VALID_STATUSES = ['PRESENTE', 'AUSENTE', 'JUSTIFICADA', 'NO_APLICA'];
const LOCKED_MSG = 'La quincena de esta reposición está cerrada. Reábrela en Liquidación para poder editar.';

// Roles que declaran la información del coordinador: lo que ellos asignan o
// reportan ES el dato del coordinador para la triple coincidencia del asistente.
const COORDINATOR_ROLES = ['ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER'];

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

// Campos del estudiante: los mínimos + los que necesita el estado derivado
// (ícono junto al nombre en la página de asistencia de la reposición).
const PARTICIPANT_STUDENT_SELECT = {
  id: true, name: true, active: true, isTrial: true, birthDate: true,
  classesAcquired: true, suspendedFrom: true, suspendedUntil: true,
};

function makeupInclude() {
  return {
    makeupProfessor: { select: { id: true, name: true } },
    substituteProfessor: { select: { id: true, name: true } },
    assistant: { select: { id: true, name: true } },
    // Quién la reportó y si el asistente confirmó su acompañamiento: una
    // reposición no está cerrada porque el coordinador la haya reportado —
    // faltan el reporte del profesor y la confirmación del asistente.
    reportedBy: { select: { id: true, email: true, role: true } },
    assistantConfirmed: { select: { id: true, name: true } },
    // Los dos reportes de staging: quién ya reportó y qué dijo cada uno. El
    // flujo precarga con ellos el reporte propio al editar.
    reports: {
      include: { attendance: { include: { student: { select: { name: true } } } } },
    },
    makeupParticipants: {
      include: { student: { select: PARTICIPANT_STUDENT_SELECT } },
      orderBy: { student: { name: 'asc' } },
    },
    attendanceRecords: {
      include: { student: { select: { id: true, name: true } } },
      orderBy: { student: { name: 'asc' } },
    },
  };
}

// Reemplaza cada participant.student por {id, name, studentStatus,
// missingBirthDate}: solo el estado, nunca montos (lo ven profesores).
async function decorateParticipants(session) {
  const students = (session.makeupParticipants || []).map((p) => p.student).filter(Boolean);
  if (!students.length) return session;
  const decorated = await attachStudentStatus(students);
  const byId = Object.fromEntries(decorated.map((s) => [s.id, s]));
  return {
    ...session,
    makeupParticipants: session.makeupParticipants.map((p) => ({
      ...p,
      student: p.student ? {
        id: p.student.id,
        name: p.student.name,
        isTrial: p.student.isTrial,
        studentStatus: byId[p.student.id]?.studentStatus || null,
        missingBirthDate: !!byId[p.student.id]?.missingBirthDate,
      } : p.student,
    })),
  };
}

// List makeup classes (optionally filter by date / status).
// El ASISTENTE también las lista: necesita verlas para marcar su acompañamiento,
// igual que ve todos los grupos del día (no se filtran por profesor).
router.get('/', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'TEACHER', 'ASSISTANT'), async (req, res, next) => {
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

    // El asistente solo necesita ubicar la reposición y cuántos estudiantes tiene:
    // no se le envía la ficha de cada estudiante.
    if (req.user.role === 'ASSISTANT') {
      return res.json({
        success: true,
        data: sessions.map((s) => ({
          ...s,
          makeupParticipants: (s.makeupParticipants || []).map((p) => ({ id: p.id, studentId: p.studentId })),
          attendanceRecords: undefined,
          reportedBy: undefined, // el asistente no necesita saber quién reportó
          reports: undefined,
        })),
      });
    }

    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
});

// El detalle (con la ficha de cada estudiante) es para quien reporta la clase;
// el asistente marca su acompañamiento desde el listado.
router.get('/:id', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'TEACHER'), async (req, res, next) => {
  try {
    const session = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: makeupInclude(),
    });
    if (!session || session.kind !== 'MAKEUP') {
      return res.status(404).json({ success: false, error: 'Reposición no encontrada' });
    }
    res.json({ success: true, data: await decorateParticipants(session) });
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

    // Auto-validación: al asignar el asistente, el coordinador/admin YA declaró
    // su parte de la triple coincidencia. Se estampa desde la creación para que
    // el pago se habilite solo cuando el profesor reporte ese mismo asistente y
    // el asistente confirme (si el profesor lo cambia, el finalize la limpia).
    const coordinatorStamp = (assistantId && COORDINATOR_ROLES.includes(req.user.role))
      ? { coordinatorValidatedById: req.user.id, coordinatorValidatedAt: new Date() }
      : {};

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
        ...coordinatorStamp,
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
    if (await isSessionPeriodLocked(existing.date)) {
      return res.status(409).json({ success: false, error: LOCKED_MSG });
    }

    const data = {};
    if (date !== undefined) data.date = new Date(date);
    if (title !== undefined) data.title = title?.slice(0, 200) || 'Reposición grupal';
    if (professorId !== undefined) data.makeupProfessorId = professorId;
    if (assistantId !== undefined) {
      data.assistantId = assistantId || null;
      // Cambiar el asistente es una nueva declaración del coordinador: se vuelve
      // a estampar su validación (o se limpia si lo dejó sin asistente).
      if ((assistantId || null) !== (existing.assistantId || null)) {
        data.coordinatorValidatedById = assistantId ? req.user.id : null;
        data.coordinatorValidatedAt = assistantId ? new Date() : null;
      }
    }
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

    // Cambiar participantes o unidades altera lo que los dos reportes deben
    // decir, así que se vuelve a consolidar. Una reposición legada (sin
    // reportes de staging) conserva el camino anterior: solo recalcular costos.
    const reportCount = await prisma.classReport.count({ where: { sessionId: req.params.id } });
    let refreshed = session;
    // Una reposición cancelada no se re-consolida: consolidar la devolvería a
    // PROGRAMADA y la descancelaría sin que nadie lo pidiera.
    if (reportCount > 0 && session.status !== 'CANCELADA') {
      await consolidateSession(req.params.id);
      refreshed = await prisma.classSession.findUnique({
        where: { id: req.params.id }, include: makeupInclude(),
      });
    } else if (['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) {
      await calculateCosts(req.params.id);
    }

    res.json({ success: true, data: refreshed });
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
    if (await isSessionPeriodLocked(existing.date)) {
      return res.status(409).json({ success: false, error: LOCKED_MSG });
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

// Reportar la asistencia de una reposición — DOBLE REPORTE, igual que una clase
// regular (nota 31): se guarda el reporte de quien llama (profesor o
// coordinador) en staging y solo cuando los dos coinciden se escribe la
// asistencia definitiva y corre el motor de costos. Ver nota 51.
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

    const reporterType = resolveReporterType(req.user.role, req.body.reporterType);
    if (!reporterType) {
      return res.status(400).json({ success: false, error: 'Indica el tipo de reporte (profesor o coordinador)' });
    }

    if (await isSessionPeriodLocked(session.date)) {
      return res.status(409).json({ success: false, error: LOCKED_MSG });
    }

    // Reposición reportada antes de la doble consolidación: se rescata ese
    // reporte para no perder su asistencia ni sus costos al consolidar.
    await backfillLegacyReport(req.params.id);

    // Re-enviar el propio reporte es una edición: se guarda la versión anterior.
    const prevReport = await prisma.classReport.findUnique({
      where: { sessionId_reporterType: { sessionId: req.params.id, reporterType } },
      include: { attendance: { include: { student: { select: { name: true } } } } },
    });

    // En una reposición no hay grupo: el "titular" es el profesor asignado, así
    // que elegir a otro en el selector equivale al sustituto de una clase.
    const dictatingId = substituteProfessorId && substituteProfessorId !== session.makeupProfessorId
      ? substituteProfessorId
      : null;

    const report = await prisma.classReport.upsert({
      where: { sessionId_reporterType: { sessionId: req.params.id, reporterType } },
      update: {
        reportedById: req.user.id,
        dictatedByOwner: !dictatingId,
        dictatingProfessorId: dictatingId,
        assistantId: assistantId || null,
      },
      create: {
        sessionId: req.params.id,
        reporterType,
        reportedById: req.user.id,
        dictatedByOwner: !dictatingId,
        dictatingProfessorId: dictatingId,
        assistantId: assistantId || null,
      },
    });

    // Los participantes de una reposición asisten como clase REGULAR: la
    // reposición ya no tiene tarifa aparte (el motor de costos los cuenta como
    // un presente más para el tramo).
    const rows = (attendanceRecords || []).map((record) => ({
      classReportId: report.id,
      studentId: record.studentId,
      status: record.status,
      attendanceType: 'REGULAR',
      justification: record.justification?.slice(0, 500) || null,
    }));
    await prisma.classReportAttendance.deleteMany({ where: { classReportId: report.id } });
    if (rows.length > 0) {
      await prisma.classReportAttendance.createMany({ data: rows });
    }

    // El PRIMER reporte (de cualquiera de los dos) marca firstReportedAt para la
    // regla de pago suspendido por reporte tardío; editar no lo vuelve a marcar.
    const sessionData = { reportedById: req.user.id };
    if (!session.firstReportedAt) sessionData.firstReportedAt = new Date();
    // Auto-validación del asistente: si quien reporta es el coordinador/admin,
    // su reporte ES la información del coordinador. Si reporta el profesor y
    // cambia el asistente, la validación previa deja de aplicar.
    if (COORDINATOR_ROLES.includes(req.user.role)) {
      sessionData.coordinatorValidatedById = req.user.id;
      sessionData.coordinatorValidatedAt = new Date();
    } else if (assistantId !== undefined && (assistantId || null) !== (session.assistantId || null)) {
      sessionData.coordinatorValidatedById = null;
      sessionData.coordinatorValidatedAt = null;
    }
    await prisma.classSession.update({ where: { id: req.params.id }, data: sessionData });

    if (prevReport) {
      await prisma.sessionEditLog.create({
        data: {
          sessionId: req.params.id,
          editedById: req.user.id,
          previousState: {
            reporterType,
            records: prevReport.attendance.map((r) => ({
              studentId: r.studentId, name: r.student?.name, status: r.status,
              attendanceType: r.attendanceType, justification: r.justification,
            })),
          },
          newState: {
            reporterType,
            records: rows.map(({ studentId, status, attendanceType, justification }) => ({
              studentId, status, attendanceType, justification,
            })),
          },
        },
      });
    }

    // MATCHED escribe la asistencia definitiva y corre el motor de costos;
    // PENDING/MISMATCH la dejan sin registros ni pago.
    const consolidation = await consolidateSession(req.params.id);

    const updated = await prisma.classSession.findUnique({
      where: { id: req.params.id },
      include: makeupInclude(),
    });
    res.json({ success: true, data: { session: updated, consolidation } });
  } catch (err) {
    next(err);
  }
});

// Cancel a makeup
const CANCEL_CATEGORIES = ['LLUVIA', 'SIN_ESTUDIANTES', 'OTRA'];
const CANCEL_AUTO_TEXT = {
  LLUVIA: 'Cancelada por lluvia',
  SIN_ESTUDIANTES: 'No llegaron estudiantes',
};

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
    if (!session || session.kind !== 'MAKEUP') {
      return res.status(404).json({ success: false, error: 'Reposición no encontrada' });
    }
    if (!(await canReportMakeup(req.user, session))) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para cancelar esta reposición' });
    }
    if (await isSessionPeriodLocked(session.date)) {
      return res.status(409).json({ success: false, error: LOCKED_MSG });
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
