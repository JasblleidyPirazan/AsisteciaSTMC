-- Gastos operativos del módulo de Contabilidad: gastos FIJOS quincenales
-- (con vigencia inicio/fin) y gastos VARIABLES cargados a una quincena.
--
-- Migración defensiva/idempotente: la BD de producción arrastra un esquema de
-- `db push` heredado, así que guardamos cada objeto con IF NOT EXISTS / guardas
-- para poder reaplicar sin chocar. Ver ensure-baseline.js (auto-recuperación).

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OperatingExpenseKind') THEN
    CREATE TYPE "OperatingExpenseKind" AS ENUM ('FIJO', 'VARIABLE');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OperatingExpenseCategory') THEN
    CREATE TYPE "OperatingExpenseCategory" AS ENUM (
      'ARRIENDO', 'SERVICIOS', 'NOMINA_ADMINISTRATIVA', 'MANTENIMIENTO',
      'IMPLEMENTOS', 'TRANSPORTE', 'MARKETING', 'IMPUESTOS_SEGUROS', 'OTRO'
    );
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "operating_expenses" (
    "id" TEXT NOT NULL,
    "kind" "OperatingExpenseKind" NOT NULL,
    "category" "OperatingExpenseCategory" NOT NULL DEFAULT 'OTRO',
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "period" TEXT,
    "expense_date" DATE,
    "provider" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "operating_expense_payments" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_by_id" TEXT,
    "paid_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operating_expense_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "operating_expenses_kind_idx" ON "operating_expenses"("kind");
CREATE INDEX IF NOT EXISTS "operating_expenses_period_idx" ON "operating_expenses"("period");
CREATE UNIQUE INDEX IF NOT EXISTS "operating_expense_payments_expense_id_period_key" ON "operating_expense_payments"("expense_id", "period");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operating_expense_payments_expense_id_fkey') THEN
    ALTER TABLE "operating_expense_payments" ADD CONSTRAINT "operating_expense_payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "operating_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
