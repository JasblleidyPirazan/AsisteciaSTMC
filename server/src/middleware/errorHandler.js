function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.code === 'P2002') {
    return res.status(409).json({ success: false, error: 'Ya existe un registro con esos datos' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ success: false, error: 'Registro no encontrado' });
  }
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Error interno del servidor',
  });
}

module.exports = errorHandler;
