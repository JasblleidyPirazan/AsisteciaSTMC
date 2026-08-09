const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/**
 * Crea (o reactiva) un usuario ADMIN de prueba.
 *
 * Uso:
 *   node src/scripts/createTestAdmin.js
 *   node src/scripts/createTestAdmin.js otro@correo.com MiClave123
 *   TEST_ADMIN_EMAIL=x@y.com TEST_ADMIN_PASSWORD=Clave123 node src/scripts/createTestAdmin.js
 *
 * Requiere DATABASE_URL en el entorno (Railway ya la provee).
 */
async function main() {
  const email =
    process.argv[2] || process.env.TEST_ADMIN_EMAIL || 'admin.test@stmc.com';
  const password =
    process.argv[3] || process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123';

  if (password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN', active: true },
    create: { email, passwordHash, role: 'ADMIN', active: true },
  });

  console.log('✅ Usuario admin de prueba listo:');
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Rol:      ${user.role}`);
  console.log('   (Cambia la contraseña tras el primer ingreso.)');
}

main()
  .catch((err) => {
    console.error('❌ Error creando el usuario de prueba:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
