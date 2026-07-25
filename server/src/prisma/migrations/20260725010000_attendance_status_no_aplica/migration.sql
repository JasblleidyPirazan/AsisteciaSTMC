-- Cuarto estado de asistencia N/A: estudiantes que compran menos clases que los
-- días del grupo y no asisten todos los días. No cuenta como asistencia ni como
-- ausencia (no penaliza el reporte, no genera reposición, no consume paquete).
-- Archivo aislado: ALTER TYPE ... ADD VALUE no admite otras sentencias en la
-- misma transacción. Defensiva: IF NOT EXISTS es idempotente.
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'NO_APLICA';
