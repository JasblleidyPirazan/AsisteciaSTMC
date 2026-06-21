#!/bin/sh
set -e

echo "🎾 Iniciando Sistema de Asistencia STMC..."

# Run database migrations (creates tables if they don't exist)
echo "📦 Aplicando migraciones de base de datos..."
npx prisma db push --schema src/prisma/schema.prisma --accept-data-loss

# Run seed (creates admin user and default config if not exists)
echo "🌱 Ejecutando seed..."
node src/scripts/seed.js

# Start the server
echo "🚀 Iniciando servidor..."
node src/index.js
