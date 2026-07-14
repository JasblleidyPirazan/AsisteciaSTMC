-- Migración defensiva/idempotente: fecha de inicio de clases del estudiante
-- (se pregunta al crearlo; piso de clases esperadas en alertas de asistencia).

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "classes_start_date" DATE;
