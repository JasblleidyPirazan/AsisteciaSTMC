import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  accompanySchema,
  getSessionContext,
  listAssistantDay,
  previewCost,
  previewSchema,
  setAssistantAccompaniment,
  submitSchema,
  submitSession,
} from '../controllers/session.controller.js';

const router = Router();

router.use(authenticate);

// HU-AST-08: flujo del asistente.
router.get('/assistant/today', authorize('ASSISTANT', 'ADMIN'), asyncHandler(listAssistantDay));
router.post('/assistant/accompany', authorize('ASSISTANT', 'ADMIN'), validateBody(accompanySchema), asyncHandler(setAssistantAccompaniment));

// HU-AST-01..06: flujo de asistencia (profesor / acudiente / admin).
router.get('/context/:groupId', asyncHandler(getSessionContext));
router.post('/preview', authorize('TEACHER', 'ADMIN', 'PARENT'), validateBody(previewSchema), asyncHandler(previewCost));
router.post('/submit', authorize('TEACHER', 'ADMIN', 'PARENT'), validateBody(submitSchema), asyncHandler(submitSession));

export default router;
