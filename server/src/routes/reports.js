const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { getCurrentPeriod } = require('../services/costEngine');

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
    const dateRange = {};
    if (from) dateRange.gte = new Date(from);
    if (to) dateRange.lte = new Date(to);
    if (from || to) where.session = { date: dateRange };

    const [records, student] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        include: {
          session: { include: { group: { select: { id: true, code: true, name: true } } } },
        },
        orderBy: { session: { date: 'desc' } },
      }),
      prisma.student.findUnique({
        where: { id: req.params.studentId },
        include: {
          enrollments: {
            include: { group: { select: { id: true, code: true, name: true } } },
          },
        },
      }),
    ]);

    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENTE').length;
    const absent = records.filter((r) => r.status === 'AUSENTE').length;
    const justified = records.filter((r) => r.status === 'JUSTIFICADA').length;

    // "Clases efectivas" = presentes + ausentes (justificadas no consumen cupo)
    const effective = present + absent;
    const contractedClasses = student?.contractedClasses ?? null;
    const avance = contractedClasses ? Math.round((effective / contractedClasses) * 100) : null;

    // Canceladas por lluvia: las sesiones CANCELADA no generan AttendanceRecord,
    // así que se cuentan aparte sobre los grupos del estudiante.
    const groupIds = (student?.enrollments || []).map((e) => e.groupId);
    let rainCancelled = 0;
    if (groupIds.length > 0) {
      const rainWhere = {
        groupId: { in: groupIds },
        status: 'CANCELADA',
        cancellationType: 'LLUVIA',
      };
      if (from || to) rainWhere.date = dateRange;
      rainCancelled = await prisma.classSession.count({ where: rainWhere });
    }

    // Matrícula primaria → grupo actual + fecha de inscripción
    const primary = (student?.enrollments || []).find((e) => e.enrollmentType === 'PRIMARY')
      || (student?.enrollments || [])[0]
      || null;

    res.json({
      success: true,
      data: {
        records,
        student: student
          ? {
              id: student.id,
              name: student.name,
              email: student.email,
              contractedClasses,
              createdAt: student.createdAt,
              enrolledAt: primary?.enrolledAt || student.createdAt,
              currentGroup: primary?.group || null,
              groups: (student.enrollments || []).map((e) => ({
                ...e.group,
                enrollmentType: e.enrollmentType,
                enrolledAt: e.enrolledAt,
              })),
            }
          : null,
        summary: {
          total,
          present,
          absent,
          justified,
          effective,
          rainCancelled,
          contractedClasses,
          avance,
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
      // Regular classes of the professor's groups, plus makeup classes they dictated
      OR: [
        { group: { professorId: req.params.professorId } },
        { makeupProfessorId: req.params.professorId },
        { substituteProfessorId: req.params.professorId },
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
        conflict: {
          include: {
            canonicalBy:  { select: { id: true, email: true, role: true } },
            challengerBy: { select: { id: true, email: true, role: true } },
            resolvedBy:   { select: { id: true, email: true } },
          },
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

module.exports = router;
