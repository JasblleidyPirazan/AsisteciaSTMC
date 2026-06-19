import { AppError } from '../lib/errors.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Errores conocidos de Prisma (violación de unicidad, etc.)
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos únicos' });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'Recurso no encontrado' });
  }

  console.error(err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}
