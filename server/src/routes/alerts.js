const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole, requirePermission } = require('../middleware/auth');
const { expectedDatesForGroup } = require('../services/schedule');
const { computeAttendanceDeviations, RED_THRESHOLD, YELLOW_THRESHOLD } = require('../services/attendanceAlerts');
const { bogotaToday, dbDateStr } = require('../lib/dates');

const router = express.Router();

/**
 * Classes whose scheduled day already passed (today included) without a report.
 * TEACHER sees only their own groups; management sees every group.
 * The alert message is explicit: a class not reported the same day gets its
 * pay suspended, and only the admin can unlock it.
 */
router.get('/pending-reports', requirePermission('pasar_lista', 'view'), async (req, res, next) => {
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

// Individual attendance alerts vs the ideal progress level.
// Roja: desviación > 4 clases · Amarilla: > 2 clases.
router.get('/attendance', requirePermission('informes', 'view'), async (req, res, next) => {
  try {
    const rows = await computeAttendanceDeviations();
    const { onlyAlerts } = req.query;
    const data = onlyAlerts === 'true' ? rows.filter((r) => r.level) : rows;
    res.json({
      success: true,
      data: {
        students: data,
        thresholds: { red: RED_THRESHOLD, yellow: YELLOW_THRESHOLD },
        alertCount: rows.filter((r) => r.level).length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Group-level rain alert: groups whose rain-cancelled class count in the
// active semester reaches the configurable threshold.
router.get('/rain', requirePermission('informes', 'view'), async (req, res, next) => {
  try {
    const semester = await prisma.semester.findFirst({ where: { active: true } });
    if (!semester) return res.json({ success: true, data: { groups: [], threshold: null } });

    const cfg = await prisma.systemConfig.findUnique({ where: { key: 'rain_alert_threshold' } });
    const threshold = parseInt(cfg?.value) || 3;

    const rainSessions = await prisma.classSession.findMany({
      where: {
        status: 'CANCELADA',
        cancellationCategory: 'LLUVIA',
        groupId: { not: null },
        date: { gte: new Date(semester.startDate), lte: new Date(semester.endDate) },
      },
      select: { groupId: true },
    });
    const countByGroup = {};
    for (const s of rainSessions) countByGroup[s.groupId] = (countByGroup[s.groupId] || 0) + 1;

    const groupIds = Object.keys(countByGroup);
    const groups = groupIds.length > 0
      ? await prisma.group.findMany({
          where: { id: { in: groupIds } },
          include: { professor: { select: { id: true, name: true } } },
        })
      : [];

    const data = groups
      .map((g) => ({
        groupId: g.id,
        code: g.code,
        professor: g.professor,
        rainCancelled: countByGroup[g.id],
        alert: countByGroup[g.id] >= threshold,
      }))
      .sort((a, b) => b.rainCancelled - a.rainCancelled);

    res.json({ success: true, data: { groups: data, threshold } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
