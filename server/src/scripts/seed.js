const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@stmc.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'ADMIN',
      },
    });
    console.log(`Admin creado: ${email}`);
  } else {
    console.log(`Admin ya existe: ${email}`);
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
    { key: 'assistant_match_start_date', value: new Date().toISOString().slice(0, 10) },
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
