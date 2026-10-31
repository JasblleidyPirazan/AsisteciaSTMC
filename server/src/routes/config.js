const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const { DEFAULT_BOOKING_CONFIG, validateSlots } = require('../services/makeupBooking');

const router = express.Router();

const CONFIG_KEYS = [
  'rate_2_students',
  'rate_3_students',
  'rate_4_students',
  'rate_5plus_students',
  'assistant_fixed_rate',
  'rain_alert_threshold',
  // Matrícula de estudiantes (derivan el estado MATRICULADO / pago completo)
  'tuition_adult_total',
  'tuition_child_total',
  'tuition_plan_classes',
  'tuition_adult_age',
  // Agendamiento público de reposiciones (turnos, cupo y ventanas)
  'makeup_slots',
  'makeup_capacity',
  'makeup_horizon_days',
  'makeup_book_cutoff_hours',
  'makeup_cancel_cutoff_hours',
];

const DEFAULTS = {
  rate_2_students: '30000',
  rate_3_students: '45000',
  rate_4_students: '60000',
  rate_5plus_students: '75000',
  assistant_fixed_rate: '12000',
  rain_alert_threshold: '3',
  tuition_adult_total: '2789000',
  tuition_child_total: '2425000',
  tuition_plan_classes: '40',
  tuition_adult_age: '16',
  makeup_slots: JSON.stringify(DEFAULT_BOOKING_CONFIG.slots.map(({ weekday, start, end }) => ({ weekday, start, end }))),
  makeup_capacity: String(DEFAULT_BOOKING_CONFIG.capacity),
  makeup_horizon_days: String(DEFAULT_BOOKING_CONFIG.horizonDays),
  makeup_book_cutoff_hours: String(DEFAULT_BOOKING_CONFIG.bookCutoffHours),
  makeup_cancel_cutoff_hours: String(DEFAULT_BOOKING_CONFIG.cancelCutoffHours),
};

// Límites de las reglas de agendamiento (mismos que `resolveBookingConfig`)
const MAKEUP_LIMITS = {
  makeup_capacity: [1, 30], makeup_horizon_days: [1, 60],
  makeup_book_cutoff_hours: [0, 168], makeup_cancel_cutoff_hours: [0, 336],
};

function invalidMakeupValue(key, value) {
  if (key === 'makeup_slots') {
    let parsed;
    try { parsed = typeof value === 'string' ? JSON.parse(value) : value; } catch { return 'makeup_slots debe ser una lista válida de turnos'; }
    return validateSlots(parsed).error || null;
  }
  const limits = MAKEUP_LIMITS[key];
  if (!limits) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < limits[0] || n > limits[1]) return `${key} debe estar entre ${limits[0]} y ${limits[1]}`;
  return null;
}

// Rates only — readable by teachers so the attendance flow can preview their pay.
// Full config (GET/PUT below) remains admin-only.
router.get('/rates', requireRole('ADMIN', 'TEACHER'), async (req, res, next) => {
  try {
    const configs = await prisma.systemConfig.findMany({ where: { key: { in: CONFIG_KEYS } } });
    const data = Object.fromEntries(configs.map((c) => [c.key, c.value]));
    for (const key of CONFIG_KEYS) {
      if (!data[key]) data[key] = DEFAULTS[key];
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const configs = await prisma.systemConfig.findMany({ where: { key: { in: CONFIG_KEYS } } });
    const data = Object.fromEntries(configs.map((c) => [c.key, c.value]));
    // Apply defaults for any missing keys
    for (const key of CONFIG_KEYS) {
      if (!data[key]) data[key] = DEFAULTS[key];
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const updates = [];
    for (const key of CONFIG_KEYS) {
      if (req.body[key] !== undefined) {
        const problem = invalidMakeupValue(key, req.body[key]);
        if (problem) return res.status(400).json({ success: false, error: problem });
        // Los turnos se guardan normalizados (con su clave derivada día-hora)
        if (key === 'makeup_slots') {
          const parsed = typeof req.body[key] === 'string' ? JSON.parse(req.body[key]) : req.body[key];
          req.body[key] = JSON.stringify(validateSlots(parsed).slots.map(({ weekday, start, end }) => ({ weekday, start, end })));
        }
        updates.push(
          prisma.systemConfig.upsert({
            where: { key },
            update: { value: String(req.body[key]), updatedBy: req.user.id },
            create: { key, value: String(req.body[key]), updatedBy: req.user.id },
          })
        );
      }
    }
    await Promise.all(updates);
    res.json({ success: true, data: { message: 'Configuración actualizada' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
