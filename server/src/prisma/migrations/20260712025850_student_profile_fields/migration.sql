-- AlterTable
-- IF NOT EXISTS: la BD de producción ya tenía estas columnas (creadas por un
-- `db push` previo de la rama de diseño), así que la migración debe ser
-- idempotente para no chocar. Ver ensure-baseline.js (auto-recuperación).
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "birth_date" DATE,
ADD COLUMN IF NOT EXISTS "document" TEXT,
ADD COLUMN IF NOT EXISTS "guardian_name" TEXT,
ADD COLUMN IF NOT EXISTS "phone" TEXT,
ADD COLUMN IF NOT EXISTS "previous_classes" INTEGER NOT NULL DEFAULT 0;
