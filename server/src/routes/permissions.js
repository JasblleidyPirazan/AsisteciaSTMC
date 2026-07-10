const express = require('express');
const { requirePermission } = require('../middleware/auth');
const { getMatrix, setMatrix, MODULES, ROLES } = require('../services/permissions');

const router = express.Router();

// Matriz efectiva + catálogo de módulos/roles para la UI. Cualquier usuario
// autenticado la lee (el cliente la usa para armar su menú y sus permisos).
router.get('/', async (req, res, next) => {
  try {
    const matrix = await getMatrix();
    res.json({ success: true, data: { matrix, modules: MODULES, roles: ROLES, myRole: req.user.role } });
  } catch (err) {
    next(err);
  }
});

// Guardar la matriz. Solo quien puede editar "roles y accesos".
router.put('/', requirePermission('roles_accesos', 'edit'), async (req, res, next) => {
  try {
    const { matrix } = req.body || {};
    if (!matrix || typeof matrix !== 'object') {
      return res.status(400).json({ success: false, error: 'matrix requerido' });
    }
    const saved = await setMatrix(matrix, req.user.id);
    res.json({ success: true, data: { matrix: saved, modules: MODULES, roles: ROLES } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
