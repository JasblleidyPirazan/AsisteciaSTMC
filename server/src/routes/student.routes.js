import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createStudent,
  createStudentSchema,
  enrollSchema,
  enrollStudent,
  getStudentHistory,
  listStudents,
} from '../controllers/student.controller.js';

const router = Router();

router.use(authenticate);

router.post('/', authorize('ADMIN'), validateBody(createStudentSchema), asyncHandler(createStudent));
router.get('/', asyncHandler(listStudents));
router.get('/:id/history', asyncHandler(getStudentHistory));
router.post('/:id/enroll', authorize('ADMIN'), validateBody(enrollSchema), asyncHandler(enrollStudent));

export default router;
