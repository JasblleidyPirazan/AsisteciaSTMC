import { ZodError } from 'zod';
import { badRequest } from '../lib/errors.js';

// Valida req.body contra un esquema de zod y reemplaza body con los datos parseados.
export function validateBody(schema) {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(badRequest('Datos inválidos', err.flatten().fieldErrors));
      }
      next(err);
    }
  };
}
