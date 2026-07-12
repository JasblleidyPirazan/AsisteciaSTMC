-- AlterTable
-- IF NOT EXISTS: idempotente por si la columna ya existe en producción (db push
-- heredado de la rama de diseño). Ver ensure-baseline.js.
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "capacity" INTEGER NOT NULL DEFAULT 8;
