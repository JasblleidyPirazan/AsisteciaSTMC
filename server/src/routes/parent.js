const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { isSeenRecord } = require('../services/attendanceStats');
const { computeAttendanceDeviations } = require('../services/attendanceAlerts');
const { attachStudentStatus } = require('../services/studentStatus');

const router = express.Router();

router.get('/children', requireRole('PARENT', 'ADMIN'), async (req, res, next) => {
  try {
    const parentUserId = req.user.role === 'PARENT' ? req.user.id : req.query.userId;
    const students = await prisma.student.findMany({
      where: { parentUserId, active: true },
      include: {
        enrollments: { include: { group: { include: { professor: { select: { name: true } } } } } },
      },
    });

    // Attendance alert for each child (deviation vs the ideal progress level)
    let alertsById = {};
    try {
      const deviations = await computeAttendanceDeviations({ studentIds: students.map((s) => s.id) });
      alertsById = Object.fromEntries(deviations.map((d) => [d.studentId, d]));
    } catch { /* alerts are best-effort here */ }

    // Estado derivado (matriculado/inscrito/…) + saldo del plan: es el propio
    // hijo del acudiente, así que puede ver su estado de pago.
    const decorated = await attachStudentStatus(students);

    res.json({
      success: true,
      data: decorated.map((s) => ({
        ...s,
        attendanceAlert: alertsById[s.id]
          ? {
              expected: alertsById[s.id].expected,
              seen: alertsById[s.id].seen,
              deviation: alertsById[s.id].deviation,
              level: alertsById[s.id].level,
            }
          : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/attendance/:studentId', requireRole('PARENT', 'ADMIN', 'TEACHER'), async (req, res, next) => {
  try {
    // Parents can only access their own children
    if (req.user.role === 'PARENT') {
      const student = await prisma.student.findFirst({
        where: { id: req.params.studentId, parentUserId: req.user.id },
      });
      if (!student) return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
    }

    const { from, to } = req.query;
    const where = { studentId: req.params.studentId };
    if (from || to) {
      where.session = { date: {} };
      if (from) where.session.date.gte = new Date(from);
      if (to) where.session.date.lte = new Date(to);
    }

    const records = await prisma.attendanceRecord.findMany({
      where,
      include: {
        session: {
          include: {
            group: { select: { id: true, code: true, name: true, ballLevel: true } },
          },
        },
      },
      orderBy: { session: { date: 'desc' } },
    });

    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENTE').length;
    const classesSeen = records.filter((r) => isSeenRecord(r, r.session?.kind)).length;

    res.json({
      success: true,
      data: {
        records,
        summary: {
          total,
          present,
          absent: records.filter((r) => r.status === 'AUSENTE').length,
          justified: records.filter((r) => r.status === 'JUSTIFICADA').length,
          classesSeen,
          attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
