-- Reservas de reprogramación (festivos y recesos) en los mismos turnos de reposición.
-- false = reposición (todo lo existente). Defensiva: segura de repetir.
ALTER TABLE "makeup_participants" ADD COLUMN IF NOT EXISTS "reprogramming" BOOLEAN NOT NULL DEFAULT false;
