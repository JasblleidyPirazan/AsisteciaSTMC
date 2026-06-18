// Errores de aplicación con código HTTP asociado.
export class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, details);
export const unauthorized = (msg = 'No autenticado') => new AppError(401, msg);
export const forbidden = (msg = 'No autorizado') => new AppError(403, msg);
export const notFound = (msg = 'Recurso no encontrado') => new AppError(404, msg);
export const conflict = (msg) => new AppError(409, msg);
