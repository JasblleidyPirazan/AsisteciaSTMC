const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { wipeClassData } = require('../services/wipeClassData');
const { buildWorkbook, buildJson } = require('../services/databaseExport');

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

// Export completo de la base de datos (botón "Exportar base de datos" en
// Configuración). Excel con una hoja por tabla + el diccionario de datos, o
// JSON como respaldo lógico. Solo ADMIN/SUPERADMIN: el archivo lleva datos
// personales y financieros de toda la academia. Los hashes de contraseña
// nunca salen (columnas marcadas como sensibles en el diccionario).
router.get('/export/database', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    if (!['xlsx', 'json'].includes(format)) {
      return res.status(400).json({ success: false, error: 'Formato no soportado: usa xlsx o json' });
    }
    const generatedBy = req.user?.email || null;
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      const dump = await buildJson(prisma, { generatedBy });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="base-de-datos-${stamp}.json"`);
      return res.send(JSON.stringify(dump, null, 2));
    }

    const { buffer } = await buildWorkbook(prisma, { generatedBy });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="base-de-datos-${stamp}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
