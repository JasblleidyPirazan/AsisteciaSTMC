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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
