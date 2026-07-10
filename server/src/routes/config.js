const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

const CONFIG_KEYS = [
  'rate_2_students',
  'rate_3_students',
  'rate_4_students',
  'rate_5plus_students',
  'assistant_fixed_rate',
  'rain_alert_threshold',
];

const DEFAULTS = {
  rate_2_students: '30000',
  rate_3_students: '45000',
  rate_4_students: '60000',
  rate_5plus_students: '75000',
  assistant_fixed_rate: '12000',
  rain_alert_threshold: '3',
};

// Rates only — readable by teachers so the attendance flow can preview their pay.
// Full config (GET/PUT below) remains admin-only.
router.get('/rates', requirePermission('nomina', 'view'), async (req, res, next) => {
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

router.get('/', requirePermission('configuracion', 'view'), async (req, res, next) => {
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

router.put('/', requirePermission('configuracion', 'edit'), async (req, res, next) => {
  try {
    const updates = [];
    for (const key of CONFIG_KEYS) {
      if (req.body[key] !== undefined) {
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
