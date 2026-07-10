const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole, requirePermission } = require('../middleware/auth');
const { bogotaToday } = require('../lib/dates');
const { notSuspended } = require('../lib/filters');
const { importFromBuffer } = require('../services/enrollmentImport');
const { isSeenRecord } = require('../services/attendanceStats');

const router = express.Router();

// Importar matrícula desde un Excel subido por el admin. El archivo llega en
// base64 (JSON) para reutilizar el parser de body existente. dryRun=true solo
// previsualiza. Solo ADMIN (procesa archivos de confianza, subidos por el admin).
router.post('/import', requirePermission('estudiantes', 'edit'), async (req, res, next) => {
  try {
    const { fileBase64, dryRun } = req.body || {};
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Archivo requerido (fileBase64)' });
    }
    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'El archivo está vacío o no es válido' });
    }
    const summary = await importFromBuffer(buffer, { dryRun: !!dryRun });
    res.json({ success: true, data: summary });
  } catch (err) {
    // Errores de formato del Excel se devuelven como 400 legible
    if (/hoja|encabezados|Consolidado/i.test(err.message)) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// Derived state shown across the app:
// INACTIVO (soft-deleted) | SUSPENDIDO (today inside suspension range) |
// MATRICULADO (payment complete) | INSCRITO (payments pending)
function studentStatus(student, today = bogotaToday()) {
  if (!student.active) return 'INACTIVO';
  if (
    student.suspendedFrom && student.suspendedUntil &&
    today >= new Date(student.suspendedFrom) && today <= new Date(student.suspendedUntil)
  ) {
    return 'SUSPENDIDO';
  }
  return student.paymentComplete ? 'MATRICULADO' : 'INSCRITO';
}

function withStatus(student) {
  return { ...student, studentStatus: studentStatus(student) };
}

router.get('/', async (req, res, next) => {
  try {
    const { active, groupId, excludeSuspended } = req.query;
    const where = {};
    if (active !== 'false') where.active = true;
    // Roster pickers (drop-ins, reposiciones, festivales) hide suspended
    // students; the admin list keeps showing them with their badge.
    if (excludeSuspended === 'true') Object.assign(where, notSuspended());

    // Parent can only see their own children
    if (req.user.role === 'PARENT') {
      where.parentUserId = req.user.id;
    }

    const include = {
      enrollments: {
        include: {
          group: { select: { id: true, code: true, name: true, ballLevel: true, subLevel: true, professor: { select: { name: true } } } },
        },
      },
    };

    let students;
    if (groupId) {
      const enrollments = await prisma.studentEnrollment.findMany({
        where: { groupId, student: where },
        include: { student: { include: include } },
        orderBy: { student: { name: 'asc' } },
      });
      students = enrollments.map((e) => e.student);
    } else {
      students = await prisma.student.findMany({
        where,
        include,
        orderBy: { name: 'asc' },
      });
    }

    res.json({ success: true, data: students.map(withStatus) });
  } catch (err) {
    next(err);
  }
});

// Resumen de asistencia por estudiante para la lista (1 sola query).
// rate = present/(present+absent): las justificadas no penalizan.
router.get('/attendance-summary', requirePermission('estudiantes', 'view'), async (req, res, next) => {
  try {
    const semester = await prisma.semester.findFirst({ where: { active: true } });
    const where = { status: { in: ['PRESENTE', 'AUSENTE'] } };
    if (semester) where.session = { date: { gte: semester.startDate, lte: semester.endDate } };

    const rows = await prisma.attendanceRecord.groupBy({
      by: ['studentId', 'status'], where, _count: { _all: true },
    });
    const map = {};
    for (const r of rows) {
      const s = (map[r.studentId] ||= { present: 0, absent: 0 });
      if (r.status === 'PRESENTE') s.present += r._count._all;
      else if (r.status === 'AUSENTE') s.absent += r._count._all;
    }
    for (const id of Object.keys(map)) {
      const s = map[id];
      const den = s.present + s.absent;
      s.rate = den > 0 ? Math.round((s.present / den) * 100) : null;
    }
    res.json({ success: true, data: map });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'PARENT') {
      const student = await prisma.student.findFirst({
        where: { id: req.params.id, parentUserId: req.user.id },
        include: { enrollments: { include: { group: true } } },
      });
      if (!student) return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
      return res.json({ success: true, data: withStatus(student) });
    }

    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        enrollments: { include: { group: { include: { professor: true } } } },
        groupHistory: {
          include: {
            fromGroup: { select: { id: true, code: true } },
            toGroup: { select: { id: true, code: true } },
          },
          orderBy: { changedAt: 'desc' },
        },
      },
    });
    if (!student) return res.status(404).json({ success: false, error: 'Estudiante no encontrado' });
    res.json({ success: true, data: withStatus(student) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('estudiantes', 'edit'), async (req, res, next) => {
  try {
    const { name, email, parentUserId, primaryGroupId, secondaryGroupId, classesAcquired,
      paymentComplete, document, phone, guardianName, birthDate } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' });

    const student = await prisma.student.create({
      data: {
        name,
        email: email || null,
        document: document || null,
        phone: phone || null,
        guardianName: guardianName || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        paymentComplete: !!paymentComplete,
        parentUserId: parentUserId || null,
        classesAcquired: Number.isFinite(+classesAcquired) ? Math.max(0, parseInt(classesAcquired)) : 0,
        enrollments: {
          create: [
            ...(primaryGroupId ? [{ groupId: primaryGroupId, enrollmentType: 'PRIMARY' }] : []),
            ...(secondaryGroupId ? [{ groupId: secondaryGroupId, enrollmentType: 'SECONDARY' }] : []),
          ],
        },
      },
      include: { enrollments: { include: { group: true } } },
    });

    // Record initial group assignment in history
    if (primaryGroupId) {
      await prisma.studentGroupHistory.create({
        data: {
          studentId: student.id,
          fromGroupId: null,
          toGroupId: primaryGroupId,
          actionType: 'ADD_GROUP',
          reason: 'Inscripción inicial',
          changedById: req.user.id,
        },
      });
    }

    res.status(201).json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requirePermission('estudiantes', 'edit'), async (req, res, next) => {
  try {
    const { name, email, parentUserId, active, deactivationReason, classesAcquired,
      document, phone, guardianName, birthDate } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (document !== undefined) data.document = document || null;
    if (phone !== undefined) data.phone = phone || null;
    if (guardianName !== undefined) data.guardianName = guardianName || null;
    if (birthDate !== undefined) data.birthDate = birthDate ? new Date(birthDate) : null;
    if (parentUserId !== undefined) data.parentUserId = parentUserId;
    if (classesAcquired !== undefined) data.classesAcquired = Math.max(0, parseInt(classesAcquired) || 0);
    if (active !== undefined) {
      data.active = active;
      if (!active) {
        data.deactivatedAt = new Date();
        data.deactivationReason = deactivationReason || null;
      }
    }

    const student = await prisma.student.update({
      where: { id: req.params.id },
      data,
      include: { enrollments: { include: { group: true } } },
    });
    res.json({ success: true, data: withStatus(student) });
  } catch (err) {
    next(err);
  }
});

// Payment status (Inscrito ↔ Matriculado). Separate endpoint so RECEPTION can
// flip it without being able to edit anything else about the student.
router.patch('/:id/payment-status', requireRole('ADMIN', 'RECEPTION', 'SUPER_ADMIN', 'DEVELOPER'), async (req, res, next) => {
  try {
    const { paymentComplete } = req.body;
    if (typeof paymentComplete !== 'boolean') {
      return res.status(400).json({ success: false, error: 'paymentComplete (true/false) requerido' });
    }
    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { paymentComplete },
      include: { enrollments: { include: { group: { select: { id: true, code: true, name: true } } } } },
    });
    res.json({ success: true, data: withStatus(student) });
  } catch (err) {
    next(err);
  }
});

// Temporary suspension (>2 weeks, shorter than the semester). While active the
// student disappears from group rosters and attendance lists; when the range
// ends they reappear automatically (filtering is done per-query, no cron).
router.post('/:id/suspend', requirePermission('estudiantes', 'edit'), async (req, res, next) => {
  try {
    const { from, until, reason } = req.body;
    if (!from || !until || !reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Fecha de inicio, fecha de fin y razón son obligatorias' });
    }
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const untilDate = new Date(`${until}T00:00:00.000Z`);
    if (isNaN(fromDate) || isNaN(untilDate) || untilDate <= fromDate) {
      return res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
    }
    const days = (untilDate - fromDate) / 86400000;
    if (days < 15) {
      return res.status(400).json({ success: false, error: 'La suspensión debe ser mayor a dos semanas (mínimo 15 días); para ausencias cortas usa justificaciones' });
    }
    const semester = await prisma.semester.findFirst({ where: { active: true } });
    if (semester && untilDate > new Date(semester.endDate)) {
      return res.status(400).json({ success: false, error: 'La suspensión no puede exceder el fin del semestre; para retiros definitivos desactiva al estudiante' });
    }

    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { suspendedFrom: fromDate, suspendedUntil: untilDate, suspensionReason: reason.trim().slice(0, 500) },
      include: { enrollments: { include: { group: { select: { id: true, code: true, name: true } } } } },
    });
    res.json({ success: true, data: withStatus(student) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/unsuspend', requirePermission('estudiantes', 'edit'), async (req, res, next) => {
  try {
    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { suspendedFrom: null, suspendedUntil: null, suspensionReason: null },
      include: { enrollments: { include: { group: { select: { id: true, code: true, name: true } } } } },
    });
    res.json({ success: true, data: withStatus(student) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requirePermission('estudiantes', 'edit'), async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Se requiere un motivo para desactivar el estudiante' });
    }

    await prisma.student.update({
      where: { id: req.params.id },
      data: {
        active: false,
        deactivationReason: reason.trim(),
        deactivatedAt: new Date(),
      },
    });
    res.json({ success: true, data: { message: 'Estudiante desactivado' } });
  } catch (err) {
    next(err);
  }
});

// Transfer student from one group to another (replaces primary enrollment, records history)
router.post('/:id/transfer', requirePermission('estudiantes', 'edit'), async (req, res, next) => {
  try {
    const { fromGroupId, toGroupId, reason } = req.body;
    if (!toGroupId) return res.status(400).json({ success: false, error: 'toGroupId requerido' });

    const studentId = req.params.id;

    // If fromGroupId provided, remove that enrollment; otherwise find and remove primary
    if (fromGroupId) {
      await prisma.studentEnrollment.deleteMany({
        where: { studentId, groupId: fromGroupId },
      });
    } else {
      // Remove primary enrollment
      await prisma.studentEnrollment.deleteMany({
        where: { studentId, enrollmentType: 'PRIMARY' },
      });
    }

    // Create new primary enrollment
    await prisma.studentEnrollment.upsert({
      where: { studentId_groupId: { studentId, groupId: toGroupId } },
      update: { enrollmentType: 'PRIMARY' },
      create: { studentId, groupId: toGroupId, enrollmentType: 'PRIMARY' },
    });

    // Record history
    await prisma.studentGroupHistory.create({
      data: {
        studentId,
        fromGroupId: fromGroupId || null,
        toGroupId,
        actionType: 'TRANSFER',
        reason: reason || null,
        changedById: req.user.id,
      },
    });

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        enrollments: { include: { group: { select: { id: true, code: true, name: true } } } },
        groupHistory: {
          include: {
            fromGroup: { select: { id: true, code: true } },
            toGroup: { select: { id: true, code: true } },
          },
          orderBy: { changedAt: 'desc' },
          take: 10,
        },
      },
    });
    res.json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
});

// Add student to an additional group (multigrupo)
router.post('/:id/enrollments', requirePermission('estudiantes', 'edit'), async (req, res, next) => {
  try {
    const { groupId, enrollmentType } = req.body;
    const studentId = req.params.id;

    const enrollment = await prisma.studentEnrollment.upsert({
      where: { studentId_groupId: { studentId, groupId } },
      update: { enrollmentType: enrollmentType || 'SECONDARY' },
      create: { studentId, groupId, enrollmentType: enrollmentType || 'SECONDARY' },
    });

    // Record history
    await prisma.studentGroupHistory.create({
      data: {
        studentId,
        fromGroupId: null,
        toGroupId: groupId,
        actionType: 'ADD_GROUP',
        reason: null,
        changedById: req.user.id,
      },
    });

    res.json({ success: true, data: enrollment });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/enrollments/:groupId', requirePermission('estudiantes', 'edit'), async (req, res, next) => {
  try {
    const { studentId: sid, groupId } = { studentId: req.params.id, groupId: req.params.groupId };

    await prisma.studentEnrollment.delete({
      where: { studentId_groupId: { studentId: sid, groupId } },
    });

    // Record history
    await prisma.studentGroupHistory.create({
      data: {
        studentId: sid,
        fromGroupId: groupId,
        toGroupId: null,
        actionType: 'REMOVE_GROUP',
        reason: null,
        changedById: req.user.id,
      },
    });

    res.json({ success: true, data: { message: 'Matrícula eliminada' } });
  } catch (err) {
    next(err);
  }
});

// Ficha del estudiante: datos + historial de asistencia (combina sesiones del
// grupo —para incluir cancelaciones— con los registros del estudiante).
router.get('/:id/report', requirePermission('estudiantes', 'view'), async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        enrollments: {
          include: { group: { select: { id: true, code: true, ballLevel: true, subLevel: true, professor: { select: { name: true } } } } },
        },
      },
    });
    if (!student) return res.status(404).json({ success: false, error: 'Estudiante no encontrado' });

    const semester = await prisma.semester.findFirst({ where: { active: true } });
    const dateRange = semester ? { gte: semester.startDate, lte: semester.endDate } : undefined;
    const groupIds = student.enrollments.map((e) => e.group.id);

    const groupSessions = groupIds.length ? await prisma.classSession.findMany({
      where: { groupId: { in: groupIds }, status: { not: 'PROGRAMADA' }, ...(dateRange ? { date: dateRange } : {}) },
      select: { id: true, date: true, status: true, cancellationCategory: true, kind: true, title: true, group: { select: { code: true, professor: { select: { name: true } } } } },
    }) : [];

    const records = await prisma.attendanceRecord.findMany({
      where: { studentId: student.id, ...(dateRange ? { session: { date: dateRange } } : {}) },
      include: { session: { select: { id: true, date: true, kind: true, status: true, cancellationCategory: true, title: true, group: { select: { code: true, professor: { select: { name: true } } } } } } },
    });
    const recBySession = Object.fromEntries(records.map((r) => [r.sessionId, r]));

    const seen = new Set();
    const timeline = [];
    const push = (sess, rec) => {
      if (!sess || seen.has(sess.id)) return;
      seen.add(sess.id);
      const cancelled = sess.status === 'CANCELADA';
      timeline.push({
        date: sess.date,
        groupCode: sess.group?.code || sess.title || '—',
        professor: sess.group?.professor?.name || '—',
        kind: sess.kind,
        cancellationCategory: cancelled ? sess.cancellationCategory : null,
        studentStatus: cancelled ? 'CANCELADA' : (rec?.status || null),
        attendanceType: rec?.attendanceType || null,
      });
    };
    for (const s of groupSessions) push(s, recBySession[s.id]);
    for (const r of records) if (!seen.has(r.sessionId)) push(r.session, r);
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    let present = 0, absent = 0, justified = 0, cancelledRain = 0, classesSeen = 0;
    for (const r of records) {
      if (r.status === 'PRESENTE') present++;
      else if (r.status === 'AUSENTE') absent++;
      else if (r.status === 'JUSTIFICADA') justified++;
      if (isSeenRecord(r, r.session?.kind)) classesSeen++;
    }
    for (const s of groupSessions) if (s.status === 'CANCELADA' && s.cancellationCategory === 'LLUVIA') cancelledRain++;
    const attendanceRate = (present + absent) > 0 ? Math.round((present / (present + absent)) * 100) : null;

    res.json({
      success: true,
      data: {
        student: withStatus(student),
        timeline,
        summary: {
          present, absent, justified, cancelledRain, classesSeen, attendanceRate,
          classesAcquired: (student.classesAcquired || 0) + (student.previousClasses || 0),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// Sumar clases de semestre anterior (solo administradores). Se acumulan aparte
// para no ser pisadas por la importación del semestre actual.
router.post('/:id/previous-classes', requireRole('ADMIN', 'SUPER_ADMIN', 'DEVELOPER'), async (req, res, next) => {
  try {
    const amount = parseInt(req.body?.amount, 10);
    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ success: false, error: 'Cantidad inválida' });
    }
    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { previousClasses: { increment: amount } },
      include: { enrollments: { include: { group: true } } },
    });
    res.json({ success: true, data: withStatus(student) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
