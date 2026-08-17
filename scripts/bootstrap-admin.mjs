import { readFile } from 'node:fs/promises'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@localhost').trim().toLowerCase()
const name = (process.env.BOOTSTRAP_ADMIN_NAME || 'Super Admin').trim()
const passwordFile = process.env.BOOTSTRAP_ADMIN_PASSWORD_FILE

if (!passwordFile) {
  throw new Error('BOOTSTRAP_ADMIN_PASSWORD_FILE is required')
}

const password = (await readFile(passwordFile, 'utf8')).trim()
if (password.length < 12) {
  throw new Error('Bootstrap administrator password must contain at least 12 characters')
}

const prisma = new PrismaClient()

try {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        name,
        password: await bcrypt.hash(password, 12),
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    })
    console.log(`Created bootstrap administrator: ${email}`)
  } else {
    console.log(`Bootstrap administrator already exists: ${email}`)
  }
} finally {
  await prisma.$disconnect()
}
