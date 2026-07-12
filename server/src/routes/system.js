const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { wipeClassData } = require('../services/wipeClassData');

const router = express.Router();

// Reinicio de datos de clases (para el arranque limpio de semestre). Borra
// sesiones/asistencia/reposiciones/festivales/costos y CONSERVA el catálogo.
// Solo SUPERADMIN y con confirmación escrita explícita.
router.post('/wipe-classes', requireRole('SUPERADMIN'), async (req, res, next) => {
  try {
    if (req.body?.confirm !== 'BORRAR CLASES') {
      return res.status(400).json({
        success: false,
        error: 'Confirmación requerida: envía confirm="BORRAR CLASES"',
      });
    }
    const results = await wipeClassData(prisma);
    const total = results.reduce((s, r) => s + r.count, 0);
    res.json({ success: true, data: { total, results } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
