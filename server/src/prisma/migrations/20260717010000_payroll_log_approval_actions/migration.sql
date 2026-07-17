-- Acciones del flujo de aprobación por clase (Validar/Retener) en el log de
-- liquidación. El endpoint ya las escribía pero el enum no las tenía: el
-- CostRecord se actualizaba y luego el log fallaba con "Datos inválidos".
-- Defensiva: ADD VALUE IF NOT EXISTS es idempotente.
ALTER TYPE "PayrollLogAction" ADD VALUE IF NOT EXISTS 'APPROVE';
ALTER TYPE "PayrollLogAction" ADD VALUE IF NOT EXISTS 'UNAPPROVE';
ALTER TYPE "PayrollLogAction" ADD VALUE IF NOT EXISTS 'HOLD';
ALTER TYPE "PayrollLogAction" ADD VALUE IF NOT EXISTS 'UNHOLD';
ALTER TYPE "PayrollLogAction" ADD VALUE IF NOT EXISTS 'BULK_APPROVE';
ALTER TYPE "PayrollLogAction" ADD VALUE IF NOT EXISTS 'BULK_UNAPPROVE';
ALTER TYPE "PayrollLogAction" ADD VALUE IF NOT EXISTS 'BULK_HOLD';
