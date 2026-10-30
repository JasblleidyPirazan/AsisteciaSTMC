-- Días de la semana que toma el estudiante en cada grupo (0 = domingo … 6 = sábado).
-- NULL = todos los días del grupo. Defensiva: segura de repetir.
ALTER TABLE "student_enrollments" ADD COLUMN IF NOT EXISTS "weekdays" INTEGER[];
