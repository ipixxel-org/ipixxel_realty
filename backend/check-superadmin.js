const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const superAdmin = await prisma.user.findUnique({
    where: { email: 'admin@realestate.com' },
  });
  console.log('Superadmin user:', superAdmin?.email);
  if (!superAdmin) return;

  const testList = [
    'Welcome@123',
    'admin',
    'admin123',
    'Admin@123',
    'changeme-before-first-deploy',
    'password',
    'password123',
    'SuperAdmin@123',
    '12345678',
    'Admin#123',
    'Admin@2024',
    'Admin@2025',
    'Admin@2026',
    'superadmin',
    'root',
  ];

  let found = null;
  for (const pw of testList) {
    if (await bcrypt.compare(pw, superAdmin.passwordHash)) {
      found = pw;
      break;
    }
  }

  if (found) {
    console.log('Password match found:', found);
  } else {
    console.log('No match among common passwords. Hash is:', superAdmin.passwordHash);
  }
}

main().finally(() => prisma.$disconnect());

