-- Agendamiento público de reposiciones (/reponer/:token): enlace personal por
-- estudiante, turno de la reposición, marca de reserva del acudiente y
-- sugerencias de horario.
--
-- Migración defensiva/idempotente (ver ensure-baseline.js): IF NOT EXISTS en todo.

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "booking_token" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "students_booking_token_key" ON "students"("booking_token");

ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "booking_slot" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "class_sessions_date_booking_slot_key" ON "class_sessions"("date", "booking_slot");

ALTER TABLE "makeup_participants" ADD COLUMN IF NOT EXISTS "booked_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "makeup_booking_suggestions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "makeup_booking_suggestions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "makeup_booking_suggestions_resolved_at_idx" ON "makeup_booking_suggestions"("resolved_at");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'makeup_booking_suggestions_student_id_fkey') THEN
    ALTER TABLE "makeup_booking_suggestions" ADD CONSTRAINT "makeup_booking_suggestions_student_id_fkey"
      FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
