const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { getCurrentPeriod } = require('../services/costEngine');
const { isSeenRecord, seenAttendanceFilter } = require('../services/attendanceStats');
const { computeAttendanceDeviations } = require('../services/attendanceAlerts');
const { byGroupCode } = require('../lib/sort');
const { bogotaToday, bogotaDateStr, bogotaMinutesOfDay } = require('../lib/dates');

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

// Bitácora de clases reportadas (módulo Reporte del profesor): una fila por
// clase con el conteo de estudiantes por estado (P/A/J). Ordenada por fecha
// ascendente para poder acumular. Filtros: from/to, level, groupId, studentId.
// TEACHER ve solo sus clases; management ve todas (o filtra por professorId).
router.get('/class-log', requireRole('ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER', 'TEACHER'), async (req, res, next) => {
  try {
    const { from, to, level, groupId, studentId } = req.query;

    let professorId = req.query.professorId || null;
    if (req.user.role === 'TEACHER') {
      const own = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      if (!own) {
        return res.json({ success: true, data: { rows: [], totals: {}, options: { groups: [], levels: [], students: [] } } });
      }
      professorId = own.id;
    }

    const where = { status: { in: ['REALIZADA', 'CANCELADA_MITAD'] } };
    if (professorId) {
      where.OR = [
        { group: { professorId } },
        { makeupProfessorId: professorId },
        { substituteProfessorId: professorId },
        { festivalProfessors: { some: { professorId } } },
      ];
    }
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const sessions = await prisma.classSession.findMany({
      where,
      include: {
        group: { select: { id: true, code: true, name: true, ballLevel: true, professor: { select: { name: true } } } },
        substituteProfessor: { select: { name: true } },
        makeupProfessor: { select: { name: true } },
        attendanceRecords: { select: { status: true, student: { select: { id: true, name: true } } } },
      },
      orderBy: { date: 'asc' },
    });

    // Opciones de filtro (sobre el conjunto sin filtrar por nivel/grupo/estudiante)
    const groupOpts = new Map();
    const levelSet = new Set();
    const studentOpts = new Map();
    for (const s of sessions) {
      if (s.group) {
        groupOpts.set(s.group.id, { id: s.group.id, code: s.group.code, name: s.group.name });
        if (s.group.ballLevel) levelSet.add(s.group.ballLevel);
      }
      for (const r of s.attendanceRecords) {
        if (r.student) studentOpts.set(r.student.id, { id: r.student.id, name: r.student.name });
      }
    }

    const rows = sessions
      .filter((s) => {
        if (level && s.group?.ballLevel !== level) return false;
        if (groupId && s.groupId !== groupId) return false;
        if (studentId && !s.attendanceRecords.some((r) => r.student?.id === studentId)) return false;
        return true;
      })
      .map((s) => {
        const c = { PRESENTE: 0, AUSENTE: 0, JUSTIFICADA: 0 };
        s.attendanceRecords.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
        const prof = s.substituteProfessor?.name || s.group?.professor?.name || s.makeupProfessor?.name || '—';
        const kindLabel = s.kind === 'MAKEUP' ? 'Reposición' : s.kind === 'FESTIVAL' ? 'Festival' : null;
        return {
          sessionId: s.id,
          date: s.date,
          kind: s.kind,
          groupCode: s.group?.code || kindLabel || '—',
          groupName: s.group?.name || s.title || null,
          level: s.group?.ballLevel || null,
          professor: prof,
          present: c.PRESENTE, absent: c.AUSENTE, justified: c.JUSTIFICADA,
          total: s.attendanceRecords.length,
        };
      });

    const totals = rows.reduce(
      (t, r) => ({
        classes: t.classes + 1,
        present: t.present + r.present,
        absent: t.absent + r.absent,
        justified: t.justified + r.justified,
        total: t.total + r.total,
      }),
      { classes: 0, present: 0, absent: 0, justified: 0, total: 0 }
    );

    res.json({
      success: true,
      data: {
        rows,
        totals,
        options: {
          groups: [...groupOpts.values()].sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true, sensitivity: 'base' })),
          levels: [...levelSet],
          students: [...studentOpts.values()].sort((a, b) => a.name.localeCompare(b.name)),
        },
      },
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
        // Dual-report staging: the two independent reports and their attendance,
        // so the class view can show a conflict side by side (read-only).
        reports: {
          include: {
            reportedBy: { select: { email: true } },
            attendance: { include: { student: { select: { id: true, name: true } } } },
          },
        },
        editLogs: {
          include: { editedBy: { select: { email: true } } },
          orderBy: { editedAt: 'desc' },
        },
      },
    });
    if (!session) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    const counts = { PRESENTE: 0, AUSENTE: 0, JUSTIFICADA: 0 };
    session.attendanceRecords.forEach((r) => counts[r.status]++);

    // Cost visible only to ADMIN/SUPERADMIN and to the teacher who dictated the class
    let showCost = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);
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
    // Mes y día calculados en hora de Bogotá (el servidor corre en UTC).
    const startOfMonth = new Date(`${bogotaDateStr().slice(0, 7)}-01T00:00:00.000Z`);
    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);
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
      where: { session: { date: bogotaToday() } },
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

// Visión Estratégica (gerencia): KPIs fundamentales del semestre activo +
// contadores por grupo (ocupación, asistencia, clases). Incluye finanzas,
// así que es solo ADMIN (SUPERADMIN pasa por superset).
router.get('/strategy', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const semester = await prisma.semester.findFirst({ where: { active: true } });
    // Ventana de análisis: el semestre activo; sin semestre, los últimos 90
    // días contados desde el día de Bogotá.
    const todayBogota = bogotaToday();
    const from = semester ? new Date(semester.startDate) : new Date(todayBogota.getTime() - 90 * 24 * 3600 * 1000);
    const to = semester ? new Date(semester.endDate) : todayBogota;
    const dateRange = { gte: from, lte: to };

    const [studentRows, groups, sessions, attRows, payments, costRows] = await Promise.all([
      prisma.student.findMany({
        where: { active: true },
        select: { paymentComplete: true, isTrial: true, suspendedFrom: true, suspendedUntil: true, createdAt: true },
      }),
      prisma.group.findMany({
        where: { active: true },
        select: {
          id: true, code: true, ballLevel: true, subLevel: true, capacity: true,
          professor: { select: { name: true } },
          _count: { select: { enrollments: true } },
        },
      }),
      // Solo clases regulares ya resueltas (realizadas/canceladas) dentro del rango.
      prisma.classSession.findMany({
        where: { kind: 'REGULAR', date: dateRange, status: { not: 'PROGRAMADA' } },
        select: { groupId: true, status: true, cancellationCategory: true },
      }),
      prisma.attendanceRecord.findMany({
        where: { session: { kind: 'REGULAR', date: dateRange } },
        select: { status: true, session: { select: { groupId: true } } },
      }),
      // Ingresos: TODOS los pagos registrados en el sistema, sin filtrar por
      // fecha. Los pagos pertenecen al semestre en curso aunque se hayan
      // recibido antes de su fecha de inicio (matrículas anticipadas).
      prisma.studentPayment.findMany({
        select: { amount: true },
      }),
      // Gastos atribuidos por fecha de clase (consistente con /payroll/my-semester).
      prisma.costRecord.findMany({
        where: { session: { date: dateRange } },
        select: { payStatus: true, total: true, paidAt: true },
      }),
    ]);

    // ---- Estudiantes ----
    const today = bogotaToday();
    let matriculados = 0, inscritos = 0, suspendidos = 0, trial = 0, newThisPeriod = 0;
    for (const s of studentRows) {
      if (s.isTrial) { trial += 1; continue; }
      const suspended = s.suspendedFrom && s.suspendedUntil &&
        today >= new Date(s.suspendedFrom) && today <= new Date(s.suspendedUntil);
      if (suspended) suspendidos += 1;
      if (s.paymentComplete) matriculados += 1; else inscritos += 1;
      if (new Date(s.createdAt) >= from) newThisPeriod += 1;
    }
    const activeStudents = matriculados + inscritos;

    // ---- Contadores por grupo ----
    const byGroup = {};
    for (const g of groups) {
      byGroup[g.id] = { realized: 0, cancelled: 0, cancelledRain: 0, present: 0, absent: 0 };
    }
    let realized = 0, cancelled = 0, cancelledRain = 0;
    for (const s of sessions) {
      const acc = byGroup[s.groupId];
      if (['REALIZADA', 'CANCELADA_MITAD'].includes(s.status)) {
        realized += 1;
        if (acc) acc.realized += 1;
      } else if (s.status === 'CANCELADA') {
        cancelled += 1;
        if (acc) acc.cancelled += 1;
        if (s.cancellationCategory === 'LLUVIA') {
          cancelledRain += 1;
          if (acc) acc.cancelledRain += 1;
        }
      }
    }
    let presentAll = 0, absentAll = 0;
    for (const r of attRows) {
      const acc = byGroup[r.session?.groupId];
      if (r.status === 'PRESENTE') { presentAll += 1; if (acc) acc.present += 1; }
      else if (r.status === 'AUSENTE') { absentAll += 1; if (acc) acc.absent += 1; }
    }
    const rate = (p, a) => (p + a > 0 ? Math.round((p / (p + a)) * 100) : null);

    const groupRows = groups.sort(byGroupCode).map((g) => {
      const acc = byGroup[g.id];
      const enrolled = g._count.enrollments;
      return {
        id: g.id, code: g.code, ballLevel: g.ballLevel, subLevel: g.subLevel,
        professor: g.professor?.name || '—',
        students: enrolled, capacity: g.capacity,
        occupancyPct: g.capacity ? Math.round((enrolled / g.capacity) * 100) : null,
        attendanceRate: rate(acc.present, acc.absent),
        realized: acc.realized, cancelled: acc.cancelled, cancelledRain: acc.cancelledRain,
      };
    });
    const totalEnrolled = groupRows.reduce((s, g) => s + g.students, 0);
    const totalCapacity = groupRows.reduce((s, g) => s + (g.capacity || 0), 0);

    // ---- Alertas de deserción (desviación de asistencia) ----
    const deviations = await computeAttendanceDeviations().catch(() => []);
    const alertRed = deviations.filter((d) => d.level === 'ROJA').length;
    const alertYellow = deviations.filter((d) => d.level === 'AMARILLA').length;

    // ---- Finanzas (criterio del módulo de Contabilidad) ----
    const income = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
    let expensesAccrued = 0, expensesPaid = 0, expensesRetained = 0;
    for (const c of costRows) {
      const amount = parseFloat(c.total);
      if (['SUSPENDED_LATE', 'PENDING_MATCH'].includes(c.payStatus)) expensesRetained += amount;
      else {
        expensesAccrued += amount;
        if (c.paidAt) expensesPaid += amount;
      }
    }
    const net = income - expensesAccrued;

    res.json({
      success: true,
      data: {
        semester: semester
          ? { name: semester.name, startDate: semester.startDate, endDate: semester.endDate }
          : null,
        students: {
          active: activeStudents, matriculados, inscritos, suspendidos, trial,
          newThisPeriod,
          conversionPct: activeStudents > 0 ? Math.round((matriculados / activeStudents) * 100) : null,
        },
        groups: {
          rows: groupRows,
          count: groupRows.length,
          totalEnrolled,
          totalCapacity,
          occupancyPct: totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : null,
          freeSpots: Math.max(0, totalCapacity - totalEnrolled),
        },
        operations: {
          realized, cancelled, cancelledRain,
          compliancePct: realized + cancelled > 0 ? Math.round((realized / (realized + cancelled)) * 100) : null,
          avgAttendance: rate(presentAll, absentAll),
        },
        alerts: { red: alertRed, yellow: alertYellow },
        finance: {
          income,
          paymentsCount: payments.length,
          expensesAccrued, expensesPaid, expensesRetained,
          net,
          marginPct: income > 0 ? Math.round((net / income) * 100) : null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// Home overview dashboard (management): KPIs, weekly attendance, distribution,
// today's classes, professor load and pending assistant reviews.
router.get('/home', requireRole('ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    // Todo el calendario del panel se ancla al día de Bogotá (server = UTC).
    const today = bogotaToday(); // medianoche UTC del día en Bogotá (@db.Date)
    const day = today.getUTCDay(); // 0=Dom
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() + (day === 0 ? -6 : 1 - day));
    const weekEnd = new Date(monday); weekEnd.setUTCDate(monday.getUTCDate() + 6);

    const semester = await prisma.semester.findFirst({ where: { active: true } });

    const [studentsActive, groupsActive, groupsInactive, professors, assistants, classesAcquiredAgg] = await Promise.all([
      prisma.student.count({ where: { active: true } }),
      prisma.group.count({ where: { active: true } }),
      prisma.group.count({ where: { active: false } }),
      prisma.professor.count({ where: { active: true } }),
      prisma.assistant.count({ where: { active: true } }),
      // Total de asistencias adquiridas (clases pagadas) por estudiantes activos.
      prisma.student.aggregate({ where: { active: true }, _sum: { classesAcquired: true } }),
    ]);
    const classesAcquired = classesAcquiredAgg._sum.classesAcquired || 0;

    // Asistencias efectivas: "clases vistas" del semestre (PRESENTE en cualquier
    // sesión + AUSENTE en festivales; las justificadas no cuentan). Sin semestre,
    // el histórico total. Avance = efectivas / adquiridas.
    const effectiveWhere = { AND: [seenAttendanceFilter()] };
    if (semester) effectiveWhere.AND.push({ session: { date: { gte: semester.startDate, lte: semester.endDate } } });
    const effectiveAttendances = await prisma.attendanceRecord.count({ where: effectiveWhere });
    const attendanceProgress = classesAcquired > 0
      ? Math.round((effectiveAttendances / classesAcquired) * 100)
      : null;
    const newThisSemester = semester
      ? await prisma.student.count({ where: { active: true, createdAt: { gte: semester.startDate } } })
      : null;

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

    const weekRecords = await prisma.attendanceRecord.findMany({
      where: { status: 'PRESENTE', session: { date: { gte: monday, lte: weekEnd } } },
      select: { session: { select: { date: true } } },
    });
    const weekly = [0, 0, 0, 0, 0, 0];
    for (const r of weekRecords) {
      const wd = new Date(r.session.date).getUTCDay();
      const idx = wd === 0 ? -1 : wd - 1;
      if (idx >= 0 && idx <= 5) weekly[idx] += 1;
    }

    const dowFields = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const todayGroups = await prisma.group.findMany({
      where: { active: true, [dowFields[day]]: true },
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
    // Hora de Bogotá, no la del servidor (UTC-5): decide "En curso" / "Próxima".
    const nowHM = bogotaMinutesOfDay();
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

    const profLoadRaw = await prisma.group.groupBy({ by: ['professorId'], where: { active: true }, _count: { _all: true } });
    const profList = await prisma.professor.findMany({ where: { active: true }, select: { id: true, name: true } });
    const profName = Object.fromEntries(profList.map((p) => [p.id, p.name]));
    const professorLoad = profLoadRaw
      .filter((r) => profName[r.professorId])
      .map((r) => ({ name: profName[r.professorId], groups: r._count._all }))
      .sort((a, b) => b.groups - a.groups);

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

    const [weekDone, weekGroups] = await Promise.all([
      prisma.classSession.count({ where: { status: { in: ['REALIZADA', 'CANCELADA_MITAD'] }, date: { gte: monday, lte: weekEnd } } }),
      prisma.group.findMany({ where: { active: true }, select: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true, sabado: true, domingo: true } }),
    ]);
    const weekTotal = weekGroups.reduce((sum, g) =>
      sum + ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].filter((dd) => g[dd]).length, 0);

    res.json({
      success: true,
      data: {
        students: {
          active: studentsActive, newThisSemester, classesAcquired,
          effectiveAttendances, attendanceProgress,
        },
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
