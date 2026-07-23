import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEPARTMENTS = [
  { name: 'Harness', code: 'HAR', description: 'Harness manufacturing department' },
  { name: 'Electronics', code: 'ELE', description: 'Electronics and PCB assembly department' },
  { name: 'Mechanical', code: 'MEC', description: 'Mechanical components and assembly department' },
  { name: 'Testing', code: 'TST', description: 'Quality assurance and testing department' },
  { name: 'Assembly', code: 'ASM', description: 'Final product assembly department' },
  { name: 'Production', code: 'PRD', description: 'Production planning and control department' },
  { name: 'R&D', code: 'RND', description: 'Research and development department' },
]

const PROJECTS_BY_DEPT: Record<string, { name: string; code: string; description: string }[]> = {
  HAR: [{ name: 'Harness Manufacturing Q4', code: 'HAR-PRJ-001', description: 'Q4 harness production project' }],
  ELE: [{ name: 'PCB Assembly Line', code: 'ELE-PRJ-001', description: 'PCB assembly and soldering project' }],
  MEC: [{ name: 'Chassis Fabrication', code: 'MEC-PRJ-001', description: 'Metal chassis fabrication project' }],
  TST: [{ name: 'Quality Audit 2024', code: 'TST-PRJ-001', description: 'Annual quality audit and certification' }],
  ASM: [{ name: 'Final Assembly Sprint', code: 'ASM-PRJ-001', description: 'Final product assembly sprint' }],
  PRD: [{ name: 'Production Optimization', code: 'PRD-PRJ-001', description: 'Production line efficiency improvement' }],
  RND: [{ name: 'New Product Development', code: 'RND-PRJ-001', description: 'R&D for next generation products' }],
}

const USERS = [
  {
    email: 'admin@inventorypro.com',
    name: 'System Admin',
    role: 'SUPER_ADMIN',
    departmentCode: null,
  },
  {
    email: 'inv.admin@inventorypro.com',
    name: 'Inventory Admin',
    role: 'INVENTORY_ADMIN',
    departmentCode: null,
  },
  {
    email: 'storekeeper@inventorypro.com',
    name: 'Store Keeper',
    role: 'STORE_KEEPER',
    departmentCode: null,
  },
  {
    email: 'dept.user@inventorypro.com',
    name: 'Department User',
    role: 'DEPARTMENT_USER',
    departmentCode: 'ASM',
  },
  {
    email: 'viewer@inventorypro.com',
    name: 'Viewer User',
    role: 'VIEWER',
    departmentCode: null,
  },
]

async function main() {
  console.log('🌱 Seeding database...')

  // ─── Seed Departments ───────────────────────────────────────────────
  console.log('  Creating departments...')
  const deptMap: Record<string, string> = {}

  for (const dept of DEPARTMENTS) {
    const created = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name, description: dept.description },
      create: { ...dept },
    })
    deptMap[dept.code] = created.id
    console.log(`    ✓ ${dept.name} (${dept.code})`)
  }

  // ─── Seed Projects ──────────────────────────────────────────────────
  console.log('  Creating projects...')
  for (const [deptCode, projects] of Object.entries(PROJECTS_BY_DEPT)) {
    const departmentId = deptMap[deptCode]
    if (!departmentId) continue

    for (const project of projects) {
      await prisma.project.upsert({
        where: { code: project.code },
        update: { name: project.name, description: project.description, departmentId },
        create: { ...project, departmentId },
      })
      console.log(`    ✓ ${project.name} (${project.code})`)
    }
  }

  // ─── Seed Users ─────────────────────────────────────────────────────
  console.log('  Creating users...')
  const password = await bcrypt.hash('Admin@123', 12)

  for (const user of USERS) {
    const departmentId = user.departmentCode ? deptMap[user.departmentCode] : null

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        password,
        departmentId,
      },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        password,
        departmentId,
      },
    })
    console.log(`    ✓ ${user.name} <${user.email}> [${user.role}]`)
  }

  console.log('\n✅ Seed completed successfully!')
  console.log('\nDefault credentials:')
  console.log('  Email: admin@inventorypro.com')
  console.log('  Password: Admin@123')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
