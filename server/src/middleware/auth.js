const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { can } = require('../services/permissions');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token requerido' });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);

    // Revalidate against DB so deactivated users / role changes take effect
    // immediately instead of waiting for the 7-day token expiry
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, role: true, active: true },
    });
    if (!user || !user.active) {
      return res.status(401).json({ success: false, error: 'Usuario inactivo o no encontrado' });
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    }
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
    }
    next();
  };
}

// Operational management roles. PHYSICAL_TRAINER acts as the school's
// "Coordinador" (renamed in the UI only — the enum value stays for db compat).
const MANAGEMENT = ['ADMIN', 'PHYSICAL_TRAINER'];

// Gate por matriz de accesos: exige que el rol pueda view/edit el módulo.
// Reemplaza a requireRole en las rutas. El scoping por propiedad se mantiene
// aparte dentro de cada handler.
function requirePermission(moduleKey, action = 'view') {
  return async (req, res, next) => {
    try {
      if (await can(req.user?.role, moduleKey, action)) return next();
      return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { authMiddleware, requireRole, requirePermission, MANAGEMENT };
