import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  const name = process.env.SEED_ADMIN_NAME?.trim()
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!email || !name || !password || password.length < 12) {
    throw new Error('SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, and a SEED_ADMIN_PASSWORD of at least 12 characters are required')
  }

  await prisma.user.upsert({
    where: { email },
    update: { name, status: 'ACTIVE' },
    create: {
      email,
      name,
      password: await bcrypt.hash(password, 12),
      status: 'ACTIVE',
    },
  })
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
