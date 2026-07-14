-- Migración defensiva/idempotente (ver nota en 20260712050000_student_payments):
-- verificación contable de los pagos de estudiantes (módulo Contabilidad).

ALTER TABLE "student_payments" ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3);
ALTER TABLE "student_payments" ADD COLUMN IF NOT EXISTS "verified_by_id" TEXT;
ALTER TABLE "student_payments" ADD COLUMN IF NOT EXISTS "verified_by_name" TEXT;
