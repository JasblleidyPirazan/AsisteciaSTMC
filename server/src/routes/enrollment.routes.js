import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  approveRequest,
  approveSchema,
  createRequest,
  createRequestSchema,
  listRequests,
  rejectRequest,
  rejectSchema,
} from '../controllers/enrollment.controller.js';

const router = Router();

// HU-INS-01: público, sin autenticación.
router.post('/', validateBody(createRequestSchema), asyncHandler(createRequest));

// HU-INS-02: gestión por administrador.
router.get('/', authenticate, authorize('ADMIN'), asyncHandler(listRequests));
router.post('/:id/approve', authenticate, authorize('ADMIN'), validateBody(approveSchema), asyncHandler(approveRequest));
router.post('/:id/reject', authenticate, authorize('ADMIN'), validateBody(rejectSchema), asyncHandler(rejectRequest));

export default router;
