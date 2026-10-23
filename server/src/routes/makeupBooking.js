// Agendamiento público de reposiciones (ver services/makeupBooking.js).
//
// Público (sin login, con el código secreto del enlace):
//   GET    /:token                       → estudiante, deuda, turnos y sus reservas
//   POST   /:token/book                  → reservar { date, slotKey }
//   DELETE /:token/book/:sessionId       → cancelar una reserva propia
//   POST   /:token/suggestions           → sugerir otro horario { text }
// Coordinación (ADMIN / Coordinador, auth inline):
//   GET    /admin/overview               → agenda de turnos, estudiantes por reponer, sugerencias
//   POST   /admin/students/:id/link      → crea (o rota con regenerate) el enlace del estudiante
//   PATCH  /admin/suggestions/:id        → marcar una sugerencia como atendida { resolved }
const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { bogotaDateStr, dbDateStr } = require('../lib/dates');
const { computeMakeupDebt } = require('../services/semesterProgress');
const { attendanceUnits, roundUnits } = require('../services/attendanceStats');
const { isSessionPeriodLocked } = require('../lib/payrollLock');
const {
  SLOT_CAPACITY, SLOT_UNITS, HORIZON_DAYS, BOOK_CUTOFF_HOURS, CANCEL_CUTOFF_HOURS,
  SUGGESTION_MAX_LENGTH, MAX_OPEN_SUGGESTIONS,
  findTemplate, upcomingSlots, canBookAt, canCancelAt, bookableCount, newToken,
} = require('../services/makeupBooking');

const router = express.Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes, intenta más tarde' },
});

const INVALID_LINK = 'Este enlace no es válido o ya no está activo. Comunícate con la Escuela.';

function fail(res, status, error) {
  return res.status(status).json({ success: false, error });
}

// Fechas excluidas del semestre activo (festivos, recesos): esos días no hay turnos.
async function loadExcludedDates() {
  const semester = await prisma.semester.findFirst({
    where: { active: true },
    include: { exclusions: true },
  });
  return (semester?.exclusions || []).map((e) => dbDateStr(e.date));
}

// Reposiciones programadas (aún sin reportar) en las que ya está el estudiante:
// cuentan como "agendadas" y descuentan de lo que puede reservar.
async function loadReservations(studentId) {
  return prisma.makeupParticipant.findMany({
    where: { studentId, session: { kind: 'MAKEUP', status: 'PROGRAMADA' } },
    include: {
      session: { select: { id: true, date: true, title: true, bookingSlot: true, effectiveUnits: true } },
    },
    orderBy: { session: { date: 'asc' } },
  });
}

async function loadDebt(studentId) {
  const { rows } = await computeMakeupDebt({ studentIds: [studentId] });
  const row = rows[0];
  return {
    pending: row?.pending || 0,
    rain: row?.rain || 0,
    justified: row?.justified || 0,
    holidays: row?.holidays || 0,
    madeUp: row?.madeUp || 0,
  };
}

async function studentByToken(token) {
  if (!token || String(token).length < 16) return null;
  const student = await prisma.student.findUnique({
    where: { bookingToken: String(token) },
    include: { enrollments: { include: { group: { select: { code: true, active: true } } } } },
  });
  return student && student.active ? student : null;
}

// Estado completo que ve el acudiente.
async function buildPublicState(student, now = new Date()) {
  const todayStr = bogotaDateStr(now);
  const [excluded, debt, reservations, suggestions] = await Promise.all([
    loadExcludedDates(),
    loadDebt(student.id),
    loadReservations(student.id),
    prisma.makeupBookingSuggestion.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);
  const slots = upcomingSlots(todayStr, excluded);
  const lastDate = slots.length ? slots[slots.length - 1].date : todayStr;
  const sessions = await prisma.classSession.findMany({
    where: {
      kind: 'MAKEUP', bookingSlot: { not: null },
      date: { gte: new Date(`${todayStr}T00:00:00Z`), lte: new Date(`${lastDate}T00:00:00Z`) },
    },
    select: { id: true, date: true, bookingSlot: true, status: true, _count: { select: { makeupParticipants: true } } },
  });
  const sessionBySlot = Object.fromEntries(sessions.map((s) => [`${dbDateStr(s.date)}|${s.bookingSlot}`, s]));
  const mineBySession = Object.fromEntries(reservations.map((r) => [r.sessionId, r]));

  const reservedUnits = roundUnits(reservations.reduce((acc, r) => acc + attendanceUnits(r.session), 0));
  const available = bookableCount(debt.pending, reservedUnits);

  const slotRows = slots.map((slot) => {
    const session = sessionBySlot[`${slot.date}|${slot.key}`];
    const taken = session?._count.makeupParticipants || 0;
    const mine = !!(session && mineBySession[session.id]);
    const open = !session || session.status === 'PROGRAMADA';
    const timeOk = canBookAt(now, slot.date, slot.start);
    return {
      ...slot,
      sessionId: session?.id || null,
      taken,
      capacity: SLOT_CAPACITY,
      full: taken >= SLOT_CAPACITY,
      closed: !open || !timeOk,
      mine,
      bookable: !mine && open && timeOk && taken < SLOT_CAPACITY && available > 0,
    };
  });

  const myBookings = reservations.map((r) => {
    const dateStr = dbDateStr(r.session.date);
    const tpl = findTemplate(r.session.bookingSlot);
    return {
      sessionId: r.sessionId,
      date: dateStr,
      title: r.session.title,
      start: tpl?.start || null,
      bookedByParent: !!r.bookedAt,
      // Solo se cancela lo que reservó el acudiente, y con anticipación
      cancellable: !!r.bookedAt && !!tpl && canCancelAt(now, dateStr, tpl.start),
    };
  });

  return {
    student: {
      name: student.name,
      groups: student.enrollments.filter((e) => e.group?.active).map((e) => e.group.code),
    },
    debt,
    reservedUnits,
    available,
    slots: slotRows,
    myBookings,
    suggestions: suggestions.map((s) => ({ id: s.id, text: s.text, createdAt: s.createdAt, resolved: !!s.resolvedAt })),
    rules: {
      capacity: SLOT_CAPACITY, horizonDays: HORIZON_DAYS,
      bookCutoffHours: BOOK_CUTOFF_HOURS, cancelCutoffHours: CANCEL_CUTOFF_HOURS,
    },
  };
}

// ─────────────────────────── Coordinación ───────────────────────────
const staff = [authMiddleware, requireRole('ADMIN', 'PHYSICAL_TRAINER')];

router.get('/admin/overview', ...staff, async (req, res, next) => {
  try {
    const todayStr = bogotaDateStr();
    const excluded = await loadExcludedDates();
    const slots = upcomingSlots(todayStr, excluded);
    const lastDate = slots.length ? slots[slots.length - 1].date : todayStr;

    const [sessions, { rows: debt }, suggestions, reservations] = await Promise.all([
      prisma.classSession.findMany({
        where: {
          kind: 'MAKEUP', bookingSlot: { not: null },
          date: { gte: new Date(`${todayStr}T00:00:00Z`), lte: new Date(`${lastDate}T00:00:00Z`) },
        },
        include: {
          makeupProfessor: { select: { id: true, name: true } },
          makeupParticipants: {
            include: { student: { select: { id: true, name: true } } },
            orderBy: { student: { name: 'asc' } },
          },
        },
      }),
      computeMakeupDebt(),
      prisma.makeupBookingSuggestion.findMany({
        where: { resolvedAt: null },
        include: { student: { select: { id: true, name: true, phone: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.makeupParticipant.findMany({
        where: { session: { kind: 'MAKEUP', status: 'PROGRAMADA' } },
        select: { studentId: true, session: { select: { effectiveUnits: true } } },
      }),
    ]);

    const sessionBySlot = Object.fromEntries(sessions.map((s) => [`${dbDateStr(s.date)}|${s.bookingSlot}`, s]));
    const agenda = slots.map((slot) => {
      const s = sessionBySlot[`${slot.date}|${slot.key}`];
      return {
        ...slot,
        capacity: SLOT_CAPACITY,
        sessionId: s?.id || null,
        status: s?.status || null,
        professor: s?.makeupProfessor || null,
        participants: (s?.makeupParticipants || []).map((p) => ({
          id: p.student.id, name: p.student.name, bookedByParent: !!p.bookedAt,
        })),
      };
    });

    const reservedById = {};
    for (const r of reservations) {
      reservedById[r.studentId] = (reservedById[r.studentId] || 0) + attendanceUnits(r.session);
    }
    const owing = debt.filter((d) => d.pending > 0);
    const contacts = await prisma.student.findMany({
      where: { id: { in: owing.map((d) => d.studentId) } },
      select: { id: true, email: true, phone: true, guardianName: true, bookingToken: true },
    });
    const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));
    const students = owing.map((d) => {
      const c = contactById[d.studentId] || {};
      const reserved = roundUnits(reservedById[d.studentId] || 0);
      return {
        studentId: d.studentId,
        name: d.name,
        groups: d.groups,
        pending: d.pending,
        reserved,
        toSchedule: bookableCount(d.pending, reserved),
        email: c.email || null,
        phone: c.phone || null,
        guardianName: c.guardianName || null,
        token: c.bookingToken || null,
      };
    });

    res.json({
      success: true,
      data: {
        today: todayStr,
        rules: { capacity: SLOT_CAPACITY, bookCutoffHours: BOOK_CUTOFF_HOURS, cancelCutoffHours: CANCEL_CUTOFF_HOURS },
        agenda,
        students,
        suggestions: suggestions.map((s) => ({
          id: s.id, text: s.text, createdAt: s.createdAt,
          student: s.student,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/students/:id/link', ...staff, async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!student || !student.active) return fail(res, 404, 'Estudiante no encontrado');
    let token = student.bookingToken;
    if (!token || req.body?.regenerate) {
      token = newToken();
      await prisma.student.update({ where: { id: student.id }, data: { bookingToken: token } });
    }
    res.json({ success: true, data: { token } });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/suggestions/:id', ...staff, async (req, res, next) => {
  try {
    const resolved = req.body?.resolved !== false;
    const updated = await prisma.makeupBookingSuggestion.update({
      where: { id: req.params.id },
      data: resolved
        ? { resolvedAt: new Date(), resolvedById: req.user.id }
        : { resolvedAt: null, resolvedById: null },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === 'P2025') return fail(res, 404, 'Sugerencia no encontrada');
    next(err);
  }
});

// ────────────────────────────── Público ──────────────────────────────
router.get('/:token', publicLimiter, async (req, res, next) => {
  try {
    const student = await studentByToken(req.params.token);
    if (!student) return fail(res, 404, INVALID_LINK);
    res.json({ success: true, data: await buildPublicState(student) });
  } catch (err) {
    next(err);
  }
});

// Error controlado dentro de la transacción de reserva.
class BookingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

router.post('/:token/book', publicLimiter, async (req, res, next) => {
  try {
    const student = await studentByToken(req.params.token);
    if (!student) return fail(res, 404, INVALID_LINK);

    const { date, slotKey } = req.body || {};
    const now = new Date();
    const excluded = await loadExcludedDates();
    const slot = upcomingSlots(bogotaDateStr(now), excluded).find((s) => s.date === date && s.key === slotKey);
    if (!slot) return fail(res, 400, 'Ese turno no está disponible');
    if (!canBookAt(now, slot.date, slot.start)) {
      return fail(res, 409, `Los turnos se reservan hasta ${BOOK_CUTOFF_HOURS} horas antes.`);
    }

    const [debt, reservations] = await Promise.all([loadDebt(student.id), loadReservations(student.id)]);
    const reservedUnits = reservations.reduce((acc, r) => acc + attendanceUnits(r.session), 0);
    if (bookableCount(debt.pending, reservedUnits) <= 0) {
      return fail(res, 409, 'Ya agendaste todas las clases que tienes por reponer.');
    }

    const dateObj = new Date(`${slot.date}T00:00:00Z`);
    if (await isSessionPeriodLocked(dateObj)) {
      return fail(res, 409, 'Ese turno ya no admite reservas. Comunícate con la Escuela.');
    }

    // Serializable + reintento: dos acudientes reservando el último cupo a la
    // vez no pueden pasarse del cupo; el @@unique(date, bookingSlot) evita
    // crear dos reposiciones para el mismo turno.
    let lastErr;
    for (let attempt = 0; attempt < 6; attempt++) {
      // Espera aleatoria entre reintentos para que las reservas simultáneas no choquen otra vez
      if (attempt > 0) await new Promise((r) => setTimeout(r, 25 + Math.random() * 100 * attempt));
      try {
        await prisma.$transaction(async (tx) => {
          let session = await tx.classSession.findUnique({
            where: { date_bookingSlot: { date: dateObj, bookingSlot: slot.key } },
            include: { makeupParticipants: { select: { studentId: true } } },
          });
          if (!session) {
            session = await tx.classSession.create({
              data: {
                kind: 'MAKEUP',
                groupId: null,
                title: `Reposición ${slot.weekday.toLowerCase()} ${slot.label}`,
                date: dateObj,
                status: 'PROGRAMADA',
                effectiveUnits: SLOT_UNITS,
                bookingSlot: slot.key,
              },
              include: { makeupParticipants: { select: { studentId: true } } },
            });
          }
          if (session.status !== 'PROGRAMADA') throw new BookingError(409, 'Ese turno ya no está disponible.');
          if (session.makeupParticipants.some((p) => p.studentId === student.id)) {
            throw new BookingError(409, 'Ya tienes una reserva en ese turno.');
          }
          if (session.makeupParticipants.length >= SLOT_CAPACITY) {
            throw new BookingError(409, 'Ese turno se acaba de llenar. Elige otro.');
          }
          await tx.makeupParticipant.create({
            data: { sessionId: session.id, studentId: student.id, bookedAt: new Date() },
          });
        }, { isolationLevel: 'Serializable' });
        lastErr = null;
        break;
      } catch (err) {
        if (err instanceof BookingError) return fail(res, err.status, err.message);
        // P2034 = conflicto de serialización, P2002 = el turno se creó en paralelo
        if (err.code === 'P2034' || err.code === 'P2002') { lastErr = err; continue; }
        throw err;
      }
    }
    if (lastErr) return fail(res, 409, 'Hubo muchas reservas al mismo tiempo. Intenta de nuevo.');

    res.status(201).json({ success: true, data: await buildPublicState(student) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:token/book/:sessionId', publicLimiter, async (req, res, next) => {
  try {
    const student = await studentByToken(req.params.token);
    if (!student) return fail(res, 404, INVALID_LINK);

    const participation = await prisma.makeupParticipant.findUnique({
      where: { sessionId_studentId: { sessionId: req.params.sessionId, studentId: student.id } },
      include: { session: true },
    });
    if (!participation || participation.session.kind !== 'MAKEUP') return fail(res, 404, 'Reserva no encontrada');
    if (!participation.bookedAt) {
      return fail(res, 403, 'Esta reposición la programó la Escuela. Para cambiarla, comunícate con ellos.');
    }
    const { session } = participation;
    const tpl = findTemplate(session.bookingSlot);
    if (session.status !== 'PROGRAMADA') return fail(res, 409, 'Esta reposición ya no se puede cancelar.');
    if (!tpl || !canCancelAt(new Date(), dbDateStr(session.date), tpl.start)) {
      return fail(res, 409, `Las reservas se cancelan hasta ${CANCEL_CUTOFF_HOURS} horas antes. Comunícate con la Escuela.`);
    }

    await prisma.makeupParticipant.delete({
      where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
    });
    // Un turno que quedó vacío deja de existir como reposición
    const left = await prisma.makeupParticipant.count({ where: { sessionId: session.id } });
    if (left === 0) {
      await prisma.classSession.delete({ where: { id: session.id } }).catch(() => {});
    }

    res.json({ success: true, data: await buildPublicState(student) });
  } catch (err) {
    next(err);
  }
});

router.post('/:token/suggestions', publicLimiter, async (req, res, next) => {
  try {
    const student = await studentByToken(req.params.token);
    if (!student) return fail(res, 404, INVALID_LINK);
    const text = String(req.body?.text || '').trim();
    if (text.length < 3) return fail(res, 400, 'Escribe qué días u horarios te servirían.');
    if (text.length > SUGGESTION_MAX_LENGTH) {
      return fail(res, 400, `Máximo ${SUGGESTION_MAX_LENGTH} caracteres.`);
    }
    const open = await prisma.makeupBookingSuggestion.count({ where: { studentId: student.id, resolvedAt: null } });
    if (open >= MAX_OPEN_SUGGESTIONS) {
      return fail(res, 409, 'Ya tienes varias sugerencias pendientes; la Escuela te contactará.');
    }
    await prisma.makeupBookingSuggestion.create({ data: { studentId: student.id, text } });
    res.status(201).json({ success: true, data: await buildPublicState(student) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
