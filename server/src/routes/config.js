const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const CONFIG_KEYS = ['rate_per_student', 'assistant_fixed_rate', 'reposition_rate'];

router.get('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const configs = await prisma.systemConfig.findMany({ where: { key: { in: CONFIG_KEYS } } });
    const data = Object.fromEntries(configs.map((c) => [c.key, c.value]));
    // Provide defaults if not set
    if (!data.rate_per_student) data.rate_per_student = '15000';
    if (!data.assistant_fixed_rate) data.assistant_fixed_rate = '12000';
    if (!data.reposition_rate) data.reposition_rate = '15000';
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
    res.json({ success: true, data: { message: 'Tarifas actualizadas' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
