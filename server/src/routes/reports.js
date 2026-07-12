const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole, requirePermission } = require('../middleware/auth');
const { getCurrentPeriod } = require('../services/costEngine');
const { isSeenRecord } = require('../services/attendanceStats');

const router = express.Router();

router.get('/group/:groupId', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'TEACHER'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = { groupId: req.params.groupId, status: { not: 'PROGRAMADA' } };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const sessions = await prisma.classSession.findMany({
      where,
      include: {
        attendanceRecords: { select: { status: true, attendanceType: true } },
        group: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });

    const data = sessions.map((s) => {
      const counts = { PRESENTE: 0, AUSENTE: 0, JUSTIFICADA: 0 };
      s.attendanceRecords.forEach((r) => counts[r.status]++);
      const total = s.attendanceRecords.length;
      return {
        ...s,
        present: counts.PRESENTE,
        absent: counts.AUSENTE,
        justified: counts.JUSTIFICADA,
        attendanceRate: total > 0 ? Math.round((counts.PRESENTE / total) * 100) : 0,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/student/:studentId', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'TEACHER', 'PARENT'), async (req, res, next) => {
  try {
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
        session: { include: { group: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: { session: { date: 'desc' } },
    });

    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENTE').length;
    // "Clases vistas": PRESENTE, más AUSENTE en festivales (J se omite)
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

router.get('/assistant/:assistantId', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'ASSISTANT'), async (req, res, next) => {
  try {
    // Assistants can only see their own report
    if (req.user.role === 'ASSISTANT') {
      const own = await prisma.assistant.findUnique({ where: { userId: req.user.id } });
      if (!own || own.id !== req.params.assistantId) {
        return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
      }
    }

    const { from, to } = req.query;
    const where = { assistantId: req.params.assistantId, status: { not: 'PROGRAMADA' } };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const sessions = await prisma.classSession.findMany({
      where,
      include: { group: { select: { id: true, code: true, name: true } } },
      orderBy: { date: 'desc' },
    });

    res.json({ success: true, data: { sessions, total: sessions.length } });
  } catch (err) {
    next(err);
  }
});

router.get('/professor/:professorId', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'TEACHER'), async (req, res, next) => {
  try {
    // Teachers can only see their own report
    if (req.user.role === 'TEACHER') {
      const own = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      if (!own || own.id !== req.params.professorId) {
        return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
      }
    }
    // Physical trainer sees attendance but never pay amounts
    const includePay = req.user.role !== 'PHYSICAL_TRAINER';

    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const where = {
      status: { not: 'PROGRAMADA' },
      // Regular classes of the professor's groups, plus makeups they dictated
      // and festivals where they participated
      OR: [
        { group: { professorId: req.params.professorId } },
        { makeupProfessorId: req.params.professorId },
        { substituteProfessorId: req.params.professorId },
        { festivalProfessors: { some: { professorId: req.params.professorId } } },
      ],
    };
    if (from || to) where.date = dateFilter;

    const sessions = await prisma.classSession.findMany({
      where,
      include: {
        group: { select: { id: true, code: true, name: true } },
        attendanceRecords: { select: { status: true, attendanceType: true } },
        costRecords: includePay
          ? {
              where: { professorId: req.params.professorId },
              select: { total: true, rate: true, presentCount: true, effectiveUnits: true },
            }
          : false,
      },
      orderBy: { date: 'desc' },
    });

    const totalPay = includePay
      ? sessions.reduce((sum, s) => sum + s.costRecords.reduce((cs, r) => cs + parseFloat(r.total), 0), 0)
      : null;

    const data = sessions.map((s) => {
      const counts = { PRESENTE: 0, AUSENTE: 0, JUSTIFICADA: 0 };
      s.attendanceRecords.forEach((r) => counts[r.status]++);
      const total = s.attendanceRecords.length;
      const pay = includePay ? s.costRecords.reduce((cs, r) => cs + parseFloat(r.total), 0) : null;
      const { costRecords, ...rest } = s;
      return {
        ...rest,
        present: counts.PRESENTE,
        absent: counts.AUSENTE,
        justified: counts.JUSTIFICADA,
        attendanceRate: total > 0 ? Math.round((counts.PRESENTE / total) * 100) : 0,
        pay,
      };
    });

    const realized = data.filter((s) => ['REALIZADA', 'CANCELADA_MITAD'].includes(s.status)).length;

    res.json({
      success: true,
      data: { sessions: data, summary: { total: sessions.length, realized, totalPay } },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/class/:sessionId', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'TEACHER'), async (req, res, next) => {
  try {
    const session = await prisma.classSession.findUnique({
      where: { id: req.params.sessionId },
      include: {
        group: { include: { professor: { select: { id: true, name: true } } } },
        substituteProfessor: { select: { id: true, name: true } },
        assistant: { select: { id: true, name: true } },
        attendanceRecords: {
          include: { student: { select: { id: true, name: true } } },
          orderBy: { student: { name: 'asc' } },
        },
        costRecords: true,
        editLogs: {
          include: { editedBy: { select: { email: true } } },
          orderBy: { editedAt: 'desc' },
        },
      },
    });
    if (!session) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    const counts = { PRESENTE: 0, AUSENTE: 0, JUSTIFICADA: 0 };
    session.attendanceRecords.forEach((r) => counts[r.status]++);

    // Cost visible only to ADMIN and to the teacher who dictated the class
    let showCost = req.user.role === 'ADMIN';
    if (!showCost && req.user.role === 'TEACHER') {
      const own = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      showCost = !!own && (
        session.group.professorId === own.id || session.substituteProfessorId === own.id
      );
    }

    const { costRecords, ...rest } = session;
    const totalCost = showCost
      ? costRecords.reduce((s, r) => s + parseFloat(r.total), 0)
      : null;

    res.json({
      success: true,
      data: {
        ...rest,
        present: counts.PRESENTE,
        absent: counts.AUSENTE,
        justified: counts.JUSTIFICADA,
        totalCost,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const isAdmin = req.user.role === 'ADMIN';
    const currentPeriod = getCurrentPeriod();

    const [totalStudents, totalGroups, sessionsThisMonth, cancelledThisMonth, costThisPeriod] =
      await Promise.all([
        prisma.student.count({ where: { active: true } }),
        prisma.group.count({ where: { active: true } }),
        prisma.classSession.count({
          where: { date: { gte: startOfMonth }, status: { in: ['REALIZADA', 'CANCELADA_MITAD'] } },
        }),
        prisma.classSession.count({
          where: { date: { gte: startOfMonth }, status: 'CANCELADA' },
        }),
        // Payroll is settled by fortnight (quincena), so the dashboard shows the
        // amount payable for the current period rather than the whole month.
        isAdmin
          ? prisma.costRecord.aggregate({
              where: { period: currentPeriod },
              _sum: { total: true },
            })
          : Promise.resolve(null),
      ]);

    const todayAttendance = await prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: { session: { date: new Date(now.toDateString()) } },
      _count: { status: true },
    });

    const counts = Object.fromEntries(todayAttendance.map((r) => [r.status, r._count.status]));

    res.json({
      success: true,
      data: {
        totalStudents,
        totalGroups,
        sessionsThisMonth,
        cancelledThisMonth,
        currentPeriod,
        // Economic figure only for ADMIN — never sent to other roles
        totalPayableThisPeriod: isAdmin ? parseFloat(costThisPeriod?._sum.total || 0) : null,
        todayPresent: counts.PRESENTE || 0,
        todayAbsent: counts.AUSENTE || 0,
        todayJustified: counts.JUSTIFICADA || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Dashboard de inicio (Home) — datos agregados para ADMIN/Coordinador.
// Sin cifras económicas, por eso el Coordinador también puede verlo.
router.get('/home', requirePermission('tablero', 'view'), async (req, res, next) => {
  try {
    const now = new Date();
    const today = new Date(now.toDateString());
    // Semana actual Lun..Sáb
    const day = now.getDay(); // 0=Dom
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (day === 0 ? -6 : 1 - day));
    const weekEnd = new Date(monday); weekEnd.setDate(monday.getDate() + 6);

    const semester = await prisma.semester.findFirst({ where: { active: true } });

    const [studentsActive, groupsActive, groupsInactive, professors, assistants] = await Promise.all([
      prisma.student.count({ where: { active: true } }),
      prisma.group.count({ where: { active: true } }),
      prisma.group.count({ where: { active: false } }),
      prisma.professor.count({ where: { active: true } }),
      prisma.assistant.count({ where: { active: true } }),
    ]);
    const newThisSemester = semester
      ? await prisma.student.count({ where: { active: true, createdAt: { gte: semester.startDate } } })
      : null;

    // Distribución de asistencia (semestre activo, o histórico)
    const attWhere = semester ? { session: { date: { gte: semester.startDate } } } : {};
    const attByStatus = await prisma.attendanceRecord.groupBy({
      by: ['status', 'attendanceType'], where: attWhere, _count: { _all: true },
    });
    let presente = 0, ausente = 0, justificado = 0, reposicion = 0;
    for (const r of attByStatus) {
      const c = r._count._all;
      if (r.attendanceType === 'REPOSICION') reposicion += c;
      else if (r.status === 'PRESENTE') presente += c;
      else if (r.status === 'AUSENTE') ausente += c;
      else if (r.status === 'JUSTIFICADA') justificado += c;
    }
    const totalAtt = presente + ausente + justificado + reposicion || 1;
    const pct = (n) => Math.round((n / totalAtt) * 100);
    const distribution = { presente: pct(presente), ausente: pct(ausente), reposicion: pct(reposicion), justificado: pct(justificado) };

    // Asistencia de la semana (Lun..Sáb): presentes por día
    const weekRecords = await prisma.attendanceRecord.findMany({
      where: { status: 'PRESENTE', session: { date: { gte: monday, lte: weekEnd } } },
      select: { session: { select: { date: true } } },
    });
    const weekly = [0, 0, 0, 0, 0, 0];
    for (const r of weekRecords) {
      const wd = new Date(r.session.date).getUTCDay(); // 0 Dom..6 Sáb
      const idx = wd === 0 ? -1 : wd - 1;
      if (idx >= 0 && idx <= 5) weekly[idx] += 1;
    }

    // Clases de hoy: grupos activos programados hoy + su sesión de hoy
    const dowFields = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const todayGroups = await prisma.group.findMany({
      where: { active: true, [dowFields[now.getDay()]]: true },
      select: {
        id: true, code: true, ballLevel: true, court: true, startTime: true, endTime: true,
        professor: { select: { name: true } }, _count: { select: { enrollments: true } },
      },
      orderBy: { startTime: 'asc' },
    });
    const todaySessions = todayGroups.length
      ? await prisma.classSession.findMany({
          where: { date: today, groupId: { in: todayGroups.map((g) => g.id) } },
          select: { groupId: true, status: true, attendanceRecords: { where: { status: 'PRESENTE' }, select: { id: true } } },
        })
      : [];
    const sessByGroup = Object.fromEntries(todaySessions.map((s) => [s.groupId, s]));
    const nowHM = now.getHours() * 60 + now.getMinutes();
    const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
    const todayClasses = todayGroups.map((g) => {
      const s = sessByGroup[g.id];
      let status;
      if (s && (s.status === 'REALIZADA' || s.status === 'CANCELADA_MITAD')) status = 'Lista';
      else if (s && s.status === 'CANCELADA') status = 'Cancelada';
      else if (nowHM >= toMin(g.startTime) && nowHM <= toMin(g.endTime)) status = 'En curso';
      else if (nowHM < toMin(g.startTime)) status = 'Próxima';
      else status = 'Pendiente';
      return {
        groupId: g.id, code: g.code, ballLevel: g.ballLevel, court: g.court, startTime: g.startTime,
        professor: g.professor?.name || '—', present: s ? s.attendanceRecords.length : 0,
        total: g._count.enrollments, status,
      };
    });

    // Carga por profesor (grupos activos por profesor)
    const profLoadRaw = await prisma.group.groupBy({ by: ['professorId'], where: { active: true }, _count: { _all: true } });
    const profList = await prisma.professor.findMany({ where: { active: true }, select: { id: true, name: true } });
    const profName = Object.fromEntries(profList.map((p) => [p.id, p.name]));
    const professorLoad = profLoadRaw
      .filter((r) => profName[r.professorId])
      .map((r) => ({ name: profName[r.professorId], groups: r._count._all }))
      .sort((a, b) => b.groups - a.groups);

    // Revisiones pendientes (cola de validación de asistentes)
    const pendingSessions = await prisma.classSession.findMany({
      where: { status: { in: ['REALIZADA', 'CANCELADA_MITAD'] }, assistantId: { not: null }, coordinatorValidatedAt: null },
      select: { id: true, assistantId: true, assistantConfirmedId: true, group: { select: { code: true, professor: { select: { name: true } } } } },
      orderBy: { date: 'desc' }, take: 5,
    });
    const pendingReviews = pendingSessions.map((s) => ({
      code: s.group?.code || '—',
      professor: s.group?.professor?.name || '—',
      note: !s.assistantConfirmedId
        ? 'Falta confirmación del asistente'
        : s.assistantConfirmedId === s.assistantId ? 'Plena coincidencia' : 'Revisar asistentes',
    }));

    // Progreso de clases de la semana ("Clase X de Y")
    const [weekDone, weekGroups] = await Promise.all([
      prisma.classSession.count({ where: { status: { in: ['REALIZADA', 'CANCELADA_MITAD'] }, date: { gte: monday, lte: weekEnd } } }),
      prisma.group.findMany({ where: { active: true }, select: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true, sabado: true, domingo: true } }),
    ]);
    const weekTotal = weekGroups.reduce((sum, g) =>
      sum + ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].filter((d) => g[d]).length, 0);

    res.json({
      success: true,
      data: {
        students: { active: studentsActive, newThisSemester },
        groups: { active: groupsActive, inactive: groupsInactive },
        staff: { professors, assistants },
        attendanceAvg: distribution.presente,
        distribution,
        weekly,
        todayClasses,
        professorLoad,
        pendingReviews,
        classProgress: { done: weekDone, total: weekTotal },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
