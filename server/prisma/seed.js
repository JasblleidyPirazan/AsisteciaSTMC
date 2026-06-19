import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Poblado inicial (sección 7.2 del documento):
// 1. Crea el usuario administrador inicial.
// 2. Crea la configuración de tarifas base.
async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@tenis.local').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin1234';

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'Administrador',
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(adminPassword, 10),
      active: true,
    },
  });
  console.log(`Administrador listo: ${admin.email}`);

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      studentRate: 15000,        // Tarifa por estudiante (profesor)
      assistantFixedRate: 12000, // Tarifa fija por clase (asistente)
      groupMakeupRate: 10000,    // Tarifa por estudiante en reposición grupal
    },
  });
  console.log('Configuración de tarifas base creada.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
