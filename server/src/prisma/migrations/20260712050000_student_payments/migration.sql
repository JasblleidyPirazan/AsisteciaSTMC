-- Migración defensiva/idempotente: la BD de producción arrastra un esquema de
-- `db push` heredado, así que guardamos cada objeto con IF NOT EXISTS / guardas
-- para poder reaplicar sin chocar. Ver ensure-baseline.js (auto-recuperación).

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethod') THEN
    CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFERENCIA', 'EFECTIVO', 'WOMPI', 'BOLD');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "student_payments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "payment_date" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "received_by_id" TEXT,
    "received_by_name" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "student_payments_student_id_idx" ON "student_payments"("student_id");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_payments_student_id_fkey') THEN
    ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_payments_received_by_id_fkey') THEN
    ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
