// Auto-baseline for the transition from `prisma db push` to Prisma Migrate.
//
// The production database was originally created with `db push`, so it already
// has every table but no Prisma migration-history table (`_prisma_migrations`).
// Running `migrate deploy` as-is would try to apply the initial migration
// (0_init: CREATE TABLE ...) and fail because the tables already exist.
//
// When the app schema exists but the history table doesn't, this script
// reconciles the legacy DB and baselines it. It is safe and idempotent:
//   - fresh/empty DB       → does nothing (migrate deploy creates everything)
//   - already baselined DB → does nothing (history table present)
//   - legacy `db push` DB  → converge + baseline (see below)
//
// IMPORTANT — legacy convergence:
// The production DB was shaped by `db push` from an OLD branch, so its schema
// can be BEHIND the `0_init` baseline (missing tables/columns/enum values that
// later code expects). Simply marking 0_init as applied would leave those gaps
// unfilled (0_init is recorded, never run), and the app would crash. So for a
// legacy DB we first run ONE `db push` to force the schema to match the current
// `schema.prisma`, then mark EVERY migration as applied. This runs only while
// `_prisma_migrations` is absent, so it happens exactly once; afterwards normal
// `migrate deploy` takes over. `--accept-data-loss` only drops columns/tables
// already removed from the current schema by design — back up before deploying.
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function migrationNames() {
  const dir = path.join(__dirname, '..', 'prisma', 'migrations');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT (to_regclass('public.users') IS NOT NULL) AS has_schema, " +
        "(to_regclass('public._prisma_migrations') IS NOT NULL) AS has_history"
    );
    const { has_schema, has_history } = rows[0];
    if (has_schema && !has_history) {
      // Converger cualquier esquema heredado (posiblemente ANTERIOR a 0_init) al
      // schema.prisma actual, y luego marcar TODO el historial como aplicado.
      console.log('🔖 BD heredada (db push) sin historial → reconciliando esquema y baselineando');
      console.log('   1/2 · db push (converger esquema al schema.prisma actual)');
      execSync('npx prisma db push --accept-data-loss --skip-generate', { stdio: 'inherit' });
      console.log('   2/2 · marcando todas las migraciones como aplicadas');
      for (const name of migrationNames()) {
        execSync(`npx prisma migrate resolve --applied ${name}`, { stdio: 'inherit' });
      }
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
