-- Botón "Pagar todo" (por beneficiario y para toda la quincena): marca como
-- pagados en lote todos los CostRecord ya aprobados de un período. Reusa
-- POST /payroll/records/bulk con action='pay'; el log necesita este valor.
-- Archivo aislado: ALTER TYPE ... ADD VALUE no admite otras sentencias en la
-- misma transacción. Defensiva: IF NOT EXISTS es idempotente.
ALTER TYPE "PayrollLogAction" ADD VALUE IF NOT EXISTS 'BULK_PAY';
