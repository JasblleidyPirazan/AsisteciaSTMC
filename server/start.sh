#!/bin/sh
set -e

echo "🎾 Iniciando Sistema de Asistencia STMC..."

# Apply versioned migrations (Prisma Migrate). A diferencia de `prisma db push`,
# `migrate deploy` NUNCA borra columnas/tablas sin una migración explícita: solo
# aplica las migraciones pendientes en src/prisma/migrations/ en orden.
#
# IMPORTANTE (una sola vez): la base de datos de producción fue creada
# originalmente con `db push`, así que ya tiene todas las tablas pero no la
# tabla de control `_prisma_migrations`. Antes del PRIMER deploy con este
# script hay que marcar la baseline como ya aplicada:
#     npx prisma migrate resolve --applied 0_init
# (ver "Flujo de migraciones" en CLAUDE.md). Ese paso es idempotente de facto:
# se corre una única vez contra la BD existente y nunca más.
echo "📦 Aplicando migraciones de base de datos..."
npx prisma migrate deploy

# Run seed (creates admin user and default config if not exists)
echo "🌱 Ejecutando seed..."
node src/scripts/seed.js

# Start the server
echo "🚀 Iniciando servidor..."
node src/index.js
