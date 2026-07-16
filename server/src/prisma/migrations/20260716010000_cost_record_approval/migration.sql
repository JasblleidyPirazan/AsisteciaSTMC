-- Migración defensiva/idempotente: flujo de aprobación por clase en la
-- liquidación (Pendiente → Aprobado → Pagado; Retener = held).

ALTER TABLE "cost_records" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);
ALTER TABLE "cost_records" ADD COLUMN IF NOT EXISTS "approved_by_id" TEXT;
ALTER TABLE "cost_records" ADD COLUMN IF NOT EXISTS "held_at" TIMESTAMP(3);
ALTER TABLE "cost_records" ADD COLUMN IF NOT EXISTS "held_by_id" TEXT;
