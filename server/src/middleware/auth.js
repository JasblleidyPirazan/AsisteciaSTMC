const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

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
      select: { id: true, email: true, role: true, active: true, leadTeacher: true },
    });
    if (!user || !user.active) {
      return res.status(401).json({ success: false, error: 'Usuario inactivo o no encontrado' });
    }

    req.user = { id: user.id, email: user.email, role: user.role, leadTeacher: user.role === 'TEACHER' && !!user.leadTeacher };
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    }
    next(err);
  }
}

// "Profesor L" no es un valor del enum Role: es un TEACHER con
// `leadTeacher = true`. Así conserva todo lo del profesor y, además, pasa las
// puertas que listan la pseudo-rol TEACHER_L.
const TEACHER_L = 'TEACHER_L';
const isLeadTeacher = (user) => user?.role === 'TEACHER' && !!user?.leadTeacher;

function requireRole(...roles) {
  return (req, res, next) => {
    // SUPERADMIN is the top role: a strict superset of ADMIN, so it passes
    // every role gate without having to be listed explicitly everywhere.
    if (req.user?.role === 'SUPERADMIN') return next();
    if (roles.includes(TEACHER_L) && isLeadTeacher(req.user)) return next();
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
    }
    next();
  };
}

// Operational management roles. PHYSICAL_TRAINER acts as the school's
// "Coordinador" (renamed in the UI only — the enum value stays for db compat).
// SUPERADMIN is included as the superset of ADMIN.
const MANAGEMENT = ['SUPERADMIN', 'ADMIN', 'PHYSICAL_TRAINER'];

module.exports = { authMiddleware, requireRole, MANAGEMENT, TEACHER_L, isLeadTeacher };
