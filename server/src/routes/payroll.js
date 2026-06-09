const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { period, payeeId } = req.query;

    if (!period) {
      return res.status(400).json({ success: false, error: 'period requerido (ej: 2025-06-1)' });
    }

    const where = { period };

    // Teachers/assistants can only see their own payroll
    if (req.user.role === 'TEACHER') {
      const professor = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      if (!professor) return res.json({ success: true, data: [] });
      where.payeeId = professor.id;
      where.payeeType = 'PROFESSOR';
    } else if (req.user.role === 'ASSISTANT') {
      const assistant = await prisma.assistant.findUnique({ where: { userId: req.user.id } });
      if (!assistant) return res.json({ success: true, data: [] });
      where.payeeId = assistant.id;
      where.payeeType = 'ASSISTANT';
    } else if (payeeId) {
      where.payeeId = payeeId;
    }

    const records = await prisma.costRecord.findMany({
      where,
      include: {
        session: {
          include: {
            group: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { session: { date: 'asc' } },
    });

    // Aggregate by payee
    const byPayee = {};
    for (const r of records) {
      if (!byPayee[r.payeeId]) {
        byPayee[r.payeeId] = {
          payeeId: r.payeeId,
          payeeType: r.payeeType,
          period,
          total: 0,
          records: [],
        };
      }
      byPayee[r.payeeId].total += parseFloat(r.total);
      byPayee[r.payeeId].records.push(r);
    }

    res.json({ success: true, data: Object.values(byPayee) });
  } catch (err) {
    next(err);
  }
});

router.get('/summary', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { period } = req.query;
    if (!period) return res.status(400).json({ success: false, error: 'period requerido' });

    const records = await prisma.costRecord.findMany({
      where: { period },
      include: {
        professor: { select: { id: true, name: true } },
        assistant: { select: { id: true, name: true } },
      },
    });

    const summary = {};
    for (const r of records) {
      const name = r.payeeType === 'PROFESSOR' ? r.professor?.name : r.assistant?.name;
      const key = `${r.payeeType}-${r.payeeId}`;
      if (!summary[key]) {
        summary[key] = { payeeId: r.payeeId, payeeType: r.payeeType, name, total: 0, classCount: 0 };
      }
      summary[key].total += parseFloat(r.total);
      summary[key].classCount++;
    }

    res.json({ success: true, data: Object.values(summary) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
