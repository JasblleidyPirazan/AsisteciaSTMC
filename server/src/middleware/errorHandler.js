function errorHandler(err, req, res, next) {
  const isProd = process.env.NODE_ENV === 'production';

  // Log all errors server-side
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err.message);

  // Prisma unique constraint violation
  if (err.code === 'P2002') {
    return res.status(409).json({ success: false, error: 'Ya existe un registro con esos datos' });
  }
  // Prisma record not found
  if (err.code === 'P2025') {
    return res.status(404).json({ success: false, error: 'Registro no encontrado' });
  }
  // Prisma foreign key constraint
  if (err.code === 'P2003') {
    return res.status(400).json({ success: false, error: 'Referencia a un registro que no existe' });
  }
  // JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'JSON inválido en el cuerpo de la solicitud' });
  }
  // Payload too large
  if (err.status === 413) {
    return res.status(413).json({ success: false, error: 'Solicitud demasiado grande' });
  }

  const status = err.status || 500;
  // In production, don't expose internal error details
  const message = isProd && status === 500
    ? 'Error interno del servidor'
    : err.message || 'Error interno del servidor';

  res.status(status).json({ success: false, error: message });
}

module.exports = errorHandler;
