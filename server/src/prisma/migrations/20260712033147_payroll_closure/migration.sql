-- Migración defensiva/idempotente: la BD de producción arrastra un esquema de
-- `db push` (rama de diseño), así que guardamos cada objeto con IF NOT EXISTS /
-- guardas para poder reaplicar sin chocar.

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayrollLogAction') THEN
    CREATE TYPE "PayrollLogAction" AS ENUM ('CLOSE', 'REOPEN', 'MARK_PAID', 'UNMARK_PAID', 'UNLOCK_LATE', 'CARRY_OVER');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "cost_records" ADD COLUMN IF NOT EXISTS "carried_from_period" TEXT,
ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "paid_by_id" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "payroll_closures" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "closed_by_id" TEXT,
    "closed_by_name" TEXT,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopened_by_id" TEXT,
    "reopened_at" TIMESTAMP(3),
    "locked" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "payroll_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payroll_closure_lines" (
    "id" TEXT NOT NULL,
    "closure_id" TEXT NOT NULL,
    "payee_type" "PayeeType" NOT NULL,
    "payee_id" TEXT NOT NULL,
    "payee_name" TEXT,
    "class_count" INTEGER NOT NULL DEFAULT 0,
    "total_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_carried" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "snapshot" JSONB,

    CONSTRAINT "payroll_closure_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payroll_logs" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "action" "PayrollLogAction" NOT NULL,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" JSONB,

    CONSTRAINT "payroll_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_closures_period_key" ON "payroll_closures"("period");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_closure_lines_closure_id_fkey') THEN
    ALTER TABLE "payroll_closure_lines" ADD CONSTRAINT "payroll_closure_lines_closure_id_fkey" FOREIGN KEY ("closure_id") REFERENCES "payroll_closures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
