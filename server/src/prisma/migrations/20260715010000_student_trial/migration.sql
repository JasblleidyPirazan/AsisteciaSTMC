-- Migración defensiva/idempotente: marca de "clase de prueba" en estudiantes
-- (prospecto creado por el profesor desde el flujo de asistencia).

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "is_trial" BOOLEAN NOT NULL DEFAULT false;
