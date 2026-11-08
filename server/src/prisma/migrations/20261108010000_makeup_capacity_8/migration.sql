-- Cupo de los turnos de reposición: 8 personas por turno (antes 6).
-- Solo datos: deja `makeup_capacity` en 8 aunque ya estuviera guardado
-- (Configuración guarda todas las claves al dar "Guardar"). Idempotente.
-- Se puede volver a cambiar desde /admin/config.
INSERT INTO "system_config" ("key", "value", "updated_at", "updated_by")
VALUES ('makeup_capacity', '8', NOW(), 'migración 20261108010000')
ON CONFLICT ("key") DO UPDATE SET "value" = '8', "updated_at" = NOW(), "updated_by" = 'migración 20261108010000';
