import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { getMySettlement, getSettlement } from '../controllers/settlement.controller.js';

const router = Router();

router.use(authenticate);

// HU-LIQ-02: liquidación propia.
router.get('/me/:period', asyncHandler(getMySettlement));

// HU-LIQ-01: liquidación global (administrador).
router.get('/:period', authorize('ADMIN'), asyncHandler(getSettlement));

export default router;
