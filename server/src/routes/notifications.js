// Correo semanal de avance a los acudientes (nota 66 de CLAUDE.md).
//
// El servidor ARMA los correos (services/progressEmail.js); no los envía. Los
// envía quien lee el feed: hoy un Google Apps Script con MailApp (ver
// docs/correo-semanal.md). Dos puertas al mismo contenido:
//   GET /weekly-progress       → vista previa para la coordinación (login ADMIN/Coordinador)
//   GET /weekly-progress/feed  → para el script de envío; header `X-Api-Key` = NOTIFY_API_KEY
// Montado SIN authMiddleware global (el feed no tiene usuario): cada ruta se protege aquí.
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { bogotaDateStr, dbDateStr } = require('../lib/dates');
const { loadLedgers } = require('../services/studentLedger');
const {
  loadBookingConfig, upcomingSlots, canBookAt, newToken, ageAllows,
} = require('../services/makeupBooking');
const { buildProgressEmail, isRecipient } = require('../services/progressEmail');
const { loadProgressInputs } = require('../services/progressReportData');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const feedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes, intenta más tarde' },
});

function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
  return `${proto}://${req.get('host')}`;
}

// Compara la clave sin filtrar su longitud ni su contenido por tiempos.
function validKey(given) {
  const expected = process.env.NOTIFY_API_KEY;
  if (!expected || expected.length < 16 || !given) return false;
  const h = (v) => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(h(given), h(expected));
}

/**
 * Arma todos los correos de la semana.
 * Devuelve { today, semester, recipients: [...], skipped: [...] }.
 */
async function buildWeeklyBatch({ appUrl, now = new Date() }) {
  const today = bogotaDateStr(now);
  const { semester, window, exclusions, ledgers } = await loadLedgers();
  const targets = ledgers.filter(isRecipient);
  const base = { today, semester: semester ? { id: semester.id, name: semester.name } : null };
  if (targets.length === 0) return { ...base, recipients: [], skipped: [] };

  const ids = targets.map((l) => l.studentId);
  const cfg = await loadBookingConfig();
  const excluded = (exclusions || []).map((e) => e.date);
  const slots = upcomingSlots(today, excluded, cfg.horizonDays, cfg.slots);
  const lastDate = slots.length ? slots[slots.length - 1].date : today;

  const [students, { recordsBy, reservationsBy }, slotSessions] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, guardianName: true, bookingToken: true, birthDate: true, parentUser: { select: { email: true } } },
    }),
    loadProgressInputs({ studentIds: ids, window, today, slots: cfg.slots }),
    prisma.classSession.findMany({
      where: {
        kind: 'MAKEUP', bookingSlot: { not: null },
        date: { gte: new Date(`${today}T00:00:00Z`), lte: new Date(`${lastDate}T00:00:00Z`) },
      },
      select: { date: true, bookingSlot: true, status: true, _count: { select: { makeupParticipants: true } } },
    }),
  ]);

  // Turnos que todavía se pueden reservar, con cupos libres (los mismos para todos)
  const bySlot = Object.fromEntries(slotSessions.map((s) => [`${dbDateStr(s.date)}|${s.bookingSlot}`, s]));
  const openSlots = slots
    .filter((s) => canBookAt(now, s.date, s.start, cfg.bookCutoffHours))
    .map((s) => {
      const session = bySlot[`${s.date}|${s.key}`];
      const closed = session && session.status !== 'PROGRAMADA';
      const taken = session?._count.makeupParticipants || 0;
      return { slot: s, date: s.date, label: s.label, free: closed ? 0 : Math.max(0, cfg.capacity - taken) };
    });

  const studentById = Object.fromEntries(students.map((s) => [s.id, s]));
  const recipients = [];
  const skipped = [];
  for (const ledger of targets) {
    const st = studentById[ledger.studentId];
    if (!st) continue;
    const to = [st.email, st.parentUser?.email].map((e) => String(e || '').trim()).find((e) => EMAIL_RE.test(e));
    if (!to) {
      skipped.push({ studentId: st.id, name: st.name, reason: 'Sin correo registrado' });
      continue;
    }
    // Enlace personal de agendamiento, solo para quien tiene reposiciones por
    // agendar; se crea si aún no existe (igual que "Enviar enlaces")
    let bookingUrl = null;
    if (Math.floor(ledger.reposicion.porAgendar || 0) > 0) {
      let token = st.bookingToken;
      if (!token) {
        token = newToken();
        await prisma.student.update({ where: { id: st.id }, data: { bookingToken: token } });
      }
      bookingUrl = `${appUrl}/reponer/${token}`;
    }
    const email = buildProgressEmail({
      student: st,
      ledger,
      records: recordsBy[st.id] || [],
      reservations: reservationsBy[st.id] || [],
      // Solo los turnos que su edad le permite tomar (edades permitidas, nota 70)
      openSlots: openSlots.filter((o) => ageAllows(o.slot, st.birthDate).ok),
      bookingUrl,
      semesterName: semester?.name || null,
      semesterEnd: semester?.endDate ? dbDateStr(semester.endDate) : null,
      today,
    });
    recipients.push({
      studentId: st.id,
      name: st.name,
      status: ledger.status,
      guardianName: st.guardianName || null,
      to,
      pendientes: ledger.reposicion.pendientes,
      porAgendar: ledger.reposicion.porAgendar,
      ...email,
    });
  }
  recipients.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  skipped.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return { ...base, recipients, skipped };
}

router.get('/weekly-progress', authMiddleware, requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const data = await buildWeeklyBatch({ appUrl: baseUrl(req) });
    res.json({ success: true, data: { ...data, feedEnabled: !!process.env.NOTIFY_API_KEY } });
  } catch (err) {
    next(err);
  }
});

router.get('/weekly-progress/feed', feedLimiter, async (req, res, next) => {
  try {
    if (!process.env.NOTIFY_API_KEY) {
      return res.status(503).json({ success: false, error: 'El envío automático no está configurado (falta NOTIFY_API_KEY)' });
    }
    if (!validKey(req.get('x-api-key'))) return res.status(401).json({ success: false, error: 'Clave inválida' });
    const data = await buildWeeklyBatch({ appUrl: baseUrl(req) });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.buildWeeklyBatch = buildWeeklyBatch;
