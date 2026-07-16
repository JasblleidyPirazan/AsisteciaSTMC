const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { bogotaDateStr } = require('../lib/dates');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@stmc.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  // The root account bootstraps the SUPERADMIN role (the only role that can
  // edit class reports and mint other ADMIN/SUPERADMIN accounts from the UI).
  // Additional ADMINs are created later from /admin/users.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'SUPERADMIN',
      },
    });
    console.log(`Superadmin creado: ${email}`);
  } else if (existing.role === 'ADMIN') {
    // Upgrade a previously-seeded ADMIN root to SUPERADMIN so a superadmin
    // always exists after deploying this change.
    await prisma.user.update({ where: { email }, data: { role: 'SUPERADMIN' } });
    console.log(`Cuenta raíz ascendida a Superadmin: ${email}`);
  } else {
    console.log(`Cuenta raíz ya existe (${existing.role}): ${email}`);
  }

  // Default system config — ranged professor rates + assistant fixed rate
  const defaults = [
    { key: 'rate_2_students', value: '30000' },
    { key: 'rate_3_students', value: '45000' },
    { key: 'rate_4_students', value: '60000' },
    { key: 'rate_5plus_students', value: '75000' },
    { key: 'assistant_fixed_rate', value: '12000' },
    // Cutoff for the assistant triple-match rule: sessions dated before this
    // stay PAYABLE (upsert only creates it once, on first deploy of the rule)
    { key: 'assistant_match_start_date', value: bogotaDateStr() },
    // Group rain alert: classes cancelled by rain in the active semester
    { key: 'rain_alert_threshold', value: '3' },
    // Matrícula de estudiantes: valor del plan de 40 clases por categoría de
    // edad. Derivan el estado MATRICULADO (pago completo) vs INSCRITO.
    { key: 'tuition_adult_total', value: '2789000' },
    { key: 'tuition_child_total', value: '2425000' },
    { key: 'tuition_plan_classes', value: '40' },
    { key: 'tuition_adult_age', value: '18' },
  ];

  for (const config of defaults) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }
  console.log('Configuración de tarifas por defecto cargada');
  console.log('Seed completado.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
