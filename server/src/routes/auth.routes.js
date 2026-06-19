import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { login, loginSchema, me } from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', validateBody(loginSchema), asyncHandler(login));
router.get('/me', authenticate, asyncHandler(me));

export default router;
