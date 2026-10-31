const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { loadLedgers, ledgerBrief } = require('../services/studentLedger');
const { loadStudentAttendance } = require('../services/studentAttendance');
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

    // El ledger de cada hijo (semáforo y cifras del paquete) reemplaza a la antigua
    // alerta de asistencia (D8). Se lee una vez y se reutiliza para el estado.
    const loaded = students.length > 0
      ? await loadLedgers({ studentIds: students.map((s) => s.id) })
      : { ledgers: [] };
    const ledgerById = Object.fromEntries(loaded.ledgers.map((l) => [l.studentId, l]));

    // Estado derivado (matriculado/inscrito/…) + saldo del plan: es el propio
    // hijo del acudiente, así que puede ver su estado de pago.
    const decorated = await attachStudentStatus(students, { loaded });

    res.json({
      success: true,
      data: decorated.map((s) => ({
        ...s,
        semaforo: ledgerById[s.id]?.semaforo || null,
        ledger: ledgerBrief(ledgerById[s.id] || null),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/attendance/:studentId', requireRole('PARENT', 'ADMIN', 'TEACHER'), async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.studentId },
      select: { parentUserId: true },
    });
    if (!student) return res.status(404).json({ success: false, error: 'Estudiante no encontrado' });
    // Parents can only access their own children
    if (req.user.role === 'PARENT' && student.parentUserId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
    }

    const { from, to } = req.query;
    res.json({
      success: true,
      data: await loadStudentAttendance(req.params.studentId, {
        from, to, groupSelect: { id: true, code: true, name: true, ballLevel: true },
      }),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
