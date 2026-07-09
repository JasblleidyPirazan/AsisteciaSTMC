const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { expectedDatesForGroup } = require('../services/schedule');
const { bogotaToday, dbDateStr } = require('../lib/dates');

const router = express.Router();

/**
 * Classes whose scheduled day already passed (today included) without a report.
 * TEACHER sees only their own groups; management sees every group.
 * The alert message is explicit: a class not reported the same day gets its
 * pay suspended, and only the admin can unlock it.
 */
router.get('/pending-reports', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'TEACHER'), async (req, res, next) => {
  try {
    const semester = await prisma.semester.findFirst({
      where: { active: true },
      include: { exclusions: true },
    });
    if (!semester) return res.json({ success: true, data: { groups: [], totalPending: 0 } });

    const groupWhere = { active: true };
    if (req.user.role === 'TEACHER') {
      const professor = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      if (!professor) return res.json({ success: true, data: { groups: [], totalPending: 0 } });
      groupWhere.professorId = professor.id;
    }

    const groups = await prisma.group.findMany({
      where: groupWhere,
      include: { professor: { select: { id: true, name: true } } },
    });
    if (groups.length === 0) return res.json({ success: true, data: { groups: [], totalPending: 0 } });

    // Any non-PROGRAMADA session counts as reported (finalized or cancelled).
    // PROGRAMADA means the flow was started but never finished → still pending.
    const sessions = await prisma.classSession.findMany({
      where: {
        groupId: { in: groups.map((g) => g.id) },
        status: { not: 'PROGRAMADA' },
        date: { gte: new Date(semester.startDate) },
      },
      select: { groupId: true, date: true },
    });
    const reported = new Set(sessions.map((s) => `${s.groupId}|${dbDateStr(s.date)}`));

    const today = bogotaToday();
    const result = [];
    let totalPending = 0;
    for (const g of groups) {
      // Groups created mid-semester aren't expected to have earlier sessions
      const expected = expectedDatesForGroup(g, semester, semester.exclusions, today, g.createdAt);
      const pendingDates = expected.filter((d) => !reported.has(`${g.id}|${d}`));
      if (pendingDates.length > 0) {
        totalPending += pendingDates.length;
        result.push({
          groupId: g.id,
          code: g.code,
          professor: g.professor,
          pendingDates,
          pendingCount: pendingDates.length,
        });
      }
    }

    res.json({ success: true, data: { groups: result, totalPending } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
