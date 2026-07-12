// Auto-baseline for the transition from `prisma db push` to Prisma Migrate.
//
// The production database was originally created with `db push`, so it already
// has every table but no Prisma migration-history table (`_prisma_migrations`).
// Running `migrate deploy` as-is would try to apply the initial migration
// (0_init: CREATE TABLE ...) and fail because the tables already exist.
//
// This script marks 0_init as already-applied ONLY when the app schema exists
// but the history table doesn't — so `migrate deploy` then runs just the NEW
// migrations. It is safe and idempotent:
//   - fresh/empty DB      → does nothing (migrate deploy creates everything)
//   - already baselined DB → does nothing (history table present)
//
// Requires DATABASE_URL and the migrations dir (both present on deploy).
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('node:child_process');

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT (to_regclass('public.users') IS NOT NULL) AS has_schema, " +
        "(to_regclass('public._prisma_migrations') IS NOT NULL) AS has_history"
    );
    const { has_schema, has_history } = rows[0];
    if (has_schema && !has_history) {
      console.log('🔖 BD existente sin historial de migraciones → marcando 0_init como aplicada');
      execSync('npx prisma migrate resolve --applied 0_init', { stdio: 'inherit' });
    } else {
      console.log(`Baseline no requerido (schema=${has_schema}, historial=${has_history}).`);
    }

    // Auto-recuperación de migraciones fallidas. La BD de producción arrastra un
    // esquema creado con `db push` (rama de diseño) que ya tenía algunas columnas,
    // por lo que una migración pudo quedar registrada como fallida y bloquear el
    // resto (P3009). La marcamos como revertida para que `migrate deploy` la
    // reintente; nuestras migraciones de columnas son idempotentes
    // (ADD COLUMN IF NOT EXISTS), así que el reintento es seguro.
    if (has_history) {
      const failed = await prisma.$queryRawUnsafe(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL'
      );
      for (const row of failed) {
        console.log(`♻️  Migración fallida detectada → revertir para reintentar: ${row.migration_name}`);
        execSync(`npx prisma migrate resolve --rolled-back ${row.migration_name}`, { stdio: 'inherit' });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
