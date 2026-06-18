import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createGroup,
  createGroupSchema,
  getGroup,
  listGroups,
  listTodayGroups,
  updateGroup,
  updateGroupSchema,
} from '../controllers/group.controller.js';

const router = Router();

router.use(authenticate);

// HU-GRP-02: grupos del día (todos los roles, filtrado por rol en el controlador).
router.get('/today', asyncHandler(listTodayGroups));

// HU-GRP-01: gestión de grupos (administrador).
router.post('/', authorize('ADMIN'), validateBody(createGroupSchema), asyncHandler(createGroup));
router.get('/', authorize('ADMIN'), asyncHandler(listGroups));
router.get('/:id', asyncHandler(getGroup));
router.patch('/:id', authorize('ADMIN'), validateBody(updateGroupSchema), asyncHandler(updateGroup));

export default router;
