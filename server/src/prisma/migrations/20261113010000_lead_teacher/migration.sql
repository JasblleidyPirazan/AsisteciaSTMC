-- "Profesor L": profesor que además gestiona la agenda de reposiciones. Defensiva: segura de repetir.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lead_teacher" BOOLEAN NOT NULL DEFAULT false;
