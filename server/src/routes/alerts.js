const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { expectedDatesForGroup } = require('../services/schedule');
const { computeGroupHolidayDeviation } = require('../services/semesterProgress');
const { loadLedgers, summarizeLedgers } = require('../services/studentLedger');
const { attachStudentStatus } = require('../services/studentStatus');
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

    // A class counts as "reported" per role (dual-report): the TEACHER needs
    // their PROFESSOR report; the coordinator their COORDINATOR report; for
    // management a class is done once both reports coincide (MATCHED). A
    // cancelled class is always done.
    const sessions = await prisma.classSession.findMany({
      where: {
        groupId: { in: groups.map((g) => g.id) },
        date: { gte: new Date(semester.startDate) },
      },
      select: {
        groupId: true,
        date: true,
        status: true,
        consolidationStatus: true,
        reports: { select: { reporterType: true } },
      },
    });
    const neededType = req.user.role === 'TEACHER' ? 'PROFESSOR'
      : req.user.role === 'PHYSICAL_TRAINER' ? 'COORDINATOR' : null;
    const isReported = (s) => {
      if (s.status === 'CANCELADA') return true;
      if (neededType) return s.reports.some((r) => r.reporterType === neededType);
      return s.consolidationStatus === 'MATCHED'; // ADMIN / SUPERADMIN
    };
    const reported = new Set(
      sessions.filter(isReported).map((s) => `${s.groupId}|${dbDateStr(s.date)}`)
    );

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

/**
 * Report conflicts (dual-report): classes where the professor's and the
 * coordinator's reports disagree (consolidationStatus = MISMATCH). Both must
 * adjust their report until they coincide. TEACHER sees only their own groups.
 */
router.get('/report-conflicts', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'TEACHER'), async (req, res, next) => {
  try {
    const where = { kind: 'REGULAR', consolidationStatus: 'MISMATCH' };

    if (req.user.role === 'TEACHER') {
      const professor = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      if (!professor) return res.json({ success: true, data: { conflicts: [], total: 0 } });
      where.group = { professorId: professor.id };
    }

    const sessions = await prisma.classSession.findMany({
      where,
      include: { group: { select: { id: true, code: true, name: true } } },
      orderBy: { date: 'asc' },
    });

    // Caso de tiempos: un estudiante divergente que YA NO está inscrito en el
    // grupo (lo trasladaron/quitaron entre los dos reportes) explica el
    // conflicto. Se anota en la respuesta (no se muta el diff almacenado) con
    // la última salida registrada en StudentGroupHistory.
    const divergent = [];
    for (const s of sessions) {
      for (const st of s.consolidationDiff?.students || []) {
        if (!st.match && st.studentId && s.groupId) divergent.push({ groupId: s.groupId, studentId: st.studentId });
      }
    }
    let enrolledSet = new Set();
    let departures = [];
    if (divergent.length > 0) {
      const groupIds = [...new Set(divergent.map((d) => d.groupId))];
      const studentIds = [...new Set(divergent.map((d) => d.studentId))];
      const [enrollments, history] = await Promise.all([
        prisma.studentEnrollment.findMany({
          where: { groupId: { in: groupIds }, studentId: { in: studentIds } },
          select: { groupId: true, studentId: true },
        }),
        prisma.studentGroupHistory.findMany({
          where: {
            fromGroupId: { in: groupIds },
            studentId: { in: studentIds },
            actionType: { in: ['TRANSFER', 'REMOVE_GROUP'] },
          },
          orderBy: { changedAt: 'desc' },
          select: { fromGroupId: true, studentId: true, actionType: true, changedAt: true },
        }),
      ]);
      enrolledSet = new Set(enrollments.map((e) => `${e.groupId}|${e.studentId}`));
      departures = history;
    }
    const departureFor = (groupId, studentId) =>
      departures.find((h) => h.fromGroupId === groupId && h.studentId === studentId) || null;

    const conflicts = sessions.map((s) => {
      let diff = s.consolidationDiff;
      if (diff?.students?.length) {
        diff = {
          ...diff,
          students: diff.students.map((st) => {
            if (st.match || !st.studentId || enrolledSet.has(`${s.groupId}|${st.studentId}`)) return st;
            const left = departureFor(s.groupId, st.studentId);
            return left ? { ...st, leftGroup: { actionType: left.actionType, changedAt: left.changedAt } } : st;
          }),
        };
      }
      return {
        sessionId: s.id,
        groupId: s.groupId,
        group: s.group,
        date: s.date,
        diff,
      };
    });

    res.json({ success: true, data: { conflicts, total: conflicts.length } });
  } catch (err) {
    next(err);
  }
});

// Group-level rain alert: groups whose rain-cancelled class count in the
// active semester reaches the configurable threshold.
router.get('/rain', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
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

// Group-level pre-enrollment alert: groups with PREINSCRITO students (derived
// status: registered, no payments yet — D7). Alert at 2 or more.
const PREINSCRITOS_THRESHOLD = 2;
router.get('/preinscritos', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const groups = await prisma.group.findMany({
      where: { active: true },
      include: {
        professor: { select: { id: true, name: true } },
        enrollments: {
          where: { student: { active: true } },
          include: { student: true },
        },
      },
    });

    // Derive each distinct student's status once, then count per group.
    const studentById = new Map();
    for (const g of groups) for (const e of g.enrollments) studentById.set(e.student.id, e.student);
    const decorated = await attachStudentStatus([...studentById.values()]);
    const statusById = new Map(decorated.map((s) => [s.id, s.studentStatus]));

    const data = groups
      .map((g) => {
        const pre = g.enrollments
          .map((e) => e.student)
          .filter((s) => statusById.get(s.id) === 'PREINSCRITO')
          .sort((a, b) => a.name.localeCompare(b.name, 'es'));
        return {
          groupId: g.id,
          code: g.code,
          professor: g.professor,
          preinscritos: pre.length,
          students: pre.map((s) => ({ id: s.id, name: s.name })),
          alert: pre.length >= PREINSCRITOS_THRESHOLD,
        };
      })
      .filter((g) => g.preinscritos > 0)
      .sort((a, b) => b.preinscritos - a.preinscritos);

    res.json({
      success: true,
      data: { groups: data, threshold: PREINSCRITOS_THRESHOLD, alertCount: data.filter((g) => g.alert).length },
    });
  } catch (err) {
    next(err);
  }
});

// Umbrales del panel: desde 3 clases de reposición por agendar, o a 3 clases (o
// menos) de completar el paquete.
const MAKEUP_ALERT_THRESHOLD = 3;
const SEMESTER_END_THRESHOLD = 3;

/**
 * Panel de Gestión — "¿estamos dando las clases que los estudiantes pagaron?".
 * Todo sale del ledger (services/studentLedger.js): una sola definición del paquete.
 *  - summary: cumplimiento del semestre (D10: todo estudiante activo, no de prueba,
 *    con paquete > 0, sin importar su estado de pago) y de dónde saldrá lo que
 *    falta — calendario regular que queda, reposiciones ya agendadas, reposiciones
 *    por agendar y déficit (lo que ni el calendario ni las reposiciones cubren).
 *  - makeups:  3 o más clases de reposición por agendar (lluvia, canceladas por la
 *    Escuela y justificadas, menos las repuestas).
 *  - shortfall: estudiantes con déficit (`pendientes.deficit > 0`).
 *  - nearEnd:  les faltan 3 clases o menos para completar su paquete.
 * Los festivos y recesos no son reposición: se recuperan corriendo el calendario.
 */
router.get('/coordinator', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const { ledgers } = await loadLedgers();
    const ls = summarizeLedgers(ledgers);
    // Mismo alcance que el resumen (D10)
    const inScope = ledgers.filter((l) => l.paquete.total > 0 && !['INACTIVO', 'PRUEBA'].includes(l.status));
    const codes = (l) => l.groups.map((g) => g.code).filter(Boolean);

    const makeups = inScope
      .filter((l) => l.reposicion.porAgendar >= MAKEUP_ALERT_THRESHOLD)
      .sort((a, b) => b.reposicion.porAgendar - a.reposicion.porAgendar || a.name.localeCompare(b.name, 'es'))
      .map((l) => ({
        studentId: l.studentId, name: l.name, groups: codes(l),
        pending: l.reposicion.porAgendar, rain: l.reposicion.lluvia, other: l.reposicion.otras,
        justified: l.reposicion.justificadas, madeUp: l.reposicion.repuestas, calendar: l.calendario.recuperables,
      }));

    const shortfall = inScope
      .filter((l) => l.pendientes.deficit > 0)
      .sort((a, b) => b.pendientes.deficit - a.pendientes.deficit || a.name.localeCompare(b.name, 'es'))
      .map((l) => ({
        studentId: l.studentId, name: l.name, groups: codes(l),
        remaining: l.pendientes.total, leftInSemester: l.pendientes.restantesEnSemestre, shortfall: l.pendientes.deficit,
        pending: l.reposicion.porAgendar, calendar: l.calendario.recuperables, projectedEnd: l.proyeccion.fin,
      }));

    const nearEnd = inScope
      .filter((l) => l.pendientes.total > 0 && l.pendientes.total <= SEMESTER_END_THRESHOLD)
      .sort((a, b) => a.pendientes.total - b.pendientes.total || a.name.localeCompare(b.name, 'es'))
      .map((l) => ({
        studentId: l.studentId, name: l.name, groups: codes(l),
        remaining: l.pendientes.total, seen: l.consumidas.total, total: l.paquete.total,
        projectedEnd: l.proyeccion.fin, endsBeyondSemester: l.proyeccion.excedeSemestre,
      }));

    res.json({
      success: true,
      data: {
        summary: {
          students: ls.students,
          completed: ls.graduados,
          paid: ls.paquete,
          seen: ls.consumidas,
          remaining: ls.pendientes.total,
          pct: ls.pct,
          // De dónde saldrán las clases que faltan (las cuatro cubetas suman `remaining`)
          coveredByCalendar: ls.pendientes.cubreCalendario,
          scheduled: ls.pendientes.agendadasAplicadas,
          makeupPending: ls.pendientes.porAgendar,
          makeupStudents: ls.reposicion.studentsPorAgendar,
          shortfall: ls.pendientes.deficit,
          shortfallStudents: ls.pendientes.studentsWithDeficit,
          // Informativo: festivos y recesos que el calendario devuelve corriéndose
          calendarPending: ls.calendario.recuperables,
          calendarStudents: ls.calendario.studentsRecuperables,
          semaforo: ls.semaforo,
        },
        makeups, shortfall, nearEnd,
        makeupsTotal: Math.round(makeups.reduce((acc, m) => acc + m.pending, 0) * 10) / 10,
        completedCount: ls.graduados,
        thresholds: { makeups: MAKEUP_ALERT_THRESHOLD, nearEnd: SEMESTER_END_THRESHOLD },
        total: makeups.length + shortfall.length + nearEnd.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Estudiantes 🎓 graduados (ya consumieron su paquete del semestre): id → true.
 * Salen del ledger (status GRADUADO).
 */
router.get('/semester-completed', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'), async (req, res, next) => {
  try {
    const { ledgers } = await loadLedgers();
    res.json({ success: true, data: { studentIds: ledgers.filter((l) => l.status === 'GRADUADO').map((l) => l.studentId) } });
  } catch (err) {
    next(err);
  }
});

/**
 * Desvío por festivos / fechas excluidas de cada grupo: cuántas clases pierde
 * el grupo porque su día cae en una fecha excluida del semestre.
 */
router.get('/holidays', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const data = await computeGroupHolidayDeviation();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
