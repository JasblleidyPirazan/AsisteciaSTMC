import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createUser,
  createUserSchema,
  getSettingsHandler,
  globalReport,
  listUsers,
  settingsSchema,
  updateSettings,
} from '../controllers/admin.controller.js';

const router = Router();

router.use(authenticate, authorize('ADMIN'));

// HU-ADM-01: configuración de tarifas.
router.get('/settings', asyncHandler(getSettingsHandler));
router.put('/settings', validateBody(settingsSchema), asyncHandler(updateSettings));

// Gestión de usuarios.
router.post('/users', validateBody(createUserSchema), asyncHandler(createUser));
router.get('/users', asyncHandler(listUsers));

// HU-ADM-02: reportes globales.
router.get('/reports/:period', asyncHandler(globalReport));

export default router;
