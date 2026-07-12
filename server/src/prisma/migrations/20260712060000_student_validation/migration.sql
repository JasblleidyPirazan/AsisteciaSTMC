-- Validación de datos + aceptación de políticas por estudiante. Defensiva/
-- idempotente (ADD COLUMN IF NOT EXISTS) por el historial de db push en prod.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "validated_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "policies_accepted_at" TIMESTAMP(3);
