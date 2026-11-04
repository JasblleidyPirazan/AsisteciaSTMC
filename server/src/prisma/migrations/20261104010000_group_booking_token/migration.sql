-- Enlace de reprogramación por grupo (/reprogramar/g/:token). Defensiva: segura de repetir.
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "booking_token" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "groups_booking_token_key" ON "groups"("booking_token");
