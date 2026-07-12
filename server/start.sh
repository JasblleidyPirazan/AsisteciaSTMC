#!/bin/sh
set -e

echo "🎾 Iniciando Sistema de Asistencia STMC..."

# Auto-baseline (transición de `db push` → Prisma Migrate). La BD de producción
# fue creada con `db push`, así que tiene las tablas pero no el historial de
# migraciones. Este paso marca 0_init como aplicada SOLO si el esquema ya existe
# sin historial; en BD nueva o ya baselineada no hace nada. Ver "Flujo de
# migraciones" en CLAUDE.md.
echo "🔖 Verificando baseline de migraciones..."
node src/scripts/ensure-baseline.js

# Apply versioned migrations. A diferencia de `prisma db push`, `migrate deploy`
# NUNCA borra columnas/tablas sin una migración explícita: solo aplica las
# migraciones pendientes en src/prisma/migrations/ en orden.
echo "📦 Aplicando migraciones de base de datos..."
npx prisma migrate deploy

# Run seed (creates admin user and default config if not exists)
echo "🌱 Ejecutando seed..."
node src/scripts/seed.js

# Start the server
echo "🚀 Iniciando servidor..."
node src/index.js
