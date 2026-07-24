import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Hash the default password
  const hashedPassword = await bcrypt.hash('Admin@123', 12)

  // Create Departments
  const itDept = await prisma.department.upsert({
    where: { code: 'IT' },
    update: {},
    create: {
      name: 'Information Technology',
      code: 'IT',
      description: 'IT Department',
      headName: 'IT Department Head',
    },
  })

  const engineeringDept = await prisma.department.upsert({
    where: { code: 'ENG' },
    update: {},
    create: {
      name: 'Engineering',
      code: 'ENG',
      description: 'Engineering Department',
      headName: 'Engineering Department Head',
    },
  })

  const hrDept = await prisma.department.upsert({
    where: { code: 'HR' },
    update: {},
    create: {
      name: 'Human Resources',
      code: 'HR',
      description: 'Human Resources Department',
      headName: 'HR Department Head',
    },
  })

  // Create Categories
  const electronicsCat = await prisma.category.upsert({
    where: { code: 'ELEC' },
    update: {},
    create: {
      name: 'Electronics',
      code: 'ELEC',
      description: 'Electronic devices and components',
    },
  })

  const officeSuppliesCat = await prisma.category.upsert({
    where: { code: 'OFF' },
    update: {},
    create: {
      name: 'Office Supplies',
      code: 'OFF',
      description: 'Office supplies and stationery',
    },
  })

  const furnitureCat = await prisma.category.upsert({
    where: { code: 'FURN' },
    update: {},
    create: {
      name: 'Furniture',
      code: 'FURN',
      description: 'Office furniture',
    },
  })

  // Create Suppliers
  const techSupplier = await prisma.supplier.upsert({
    where: { name: 'TechSource Ltd.' },
    update: {},
    create: {
      name: 'TechSource Ltd.',
      contactPerson: 'John Smith',
      phone: '+92-300-1234567',
      email: 'sales@techsource.pk',
      address: '123 Tech Street, Lahore',
    },
  })

  const officeSupplier = await prisma.supplier.upsert({
    where: { name: 'OfficeMart' },
    update: {},
    create: {
      name: 'OfficeMart',
      contactPerson: 'Ali Khan',
      phone: '+92-300-9876543',
      email: 'info@officemart.pk',
      address: '456 Commerce Road, Karachi',
    },
  })

  // Create Demo Users
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@inventorypro.com' },
    update: { password: hashedPassword },
    create: {
      email: 'admin@inventorypro.com',
      password: hashedPassword,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  })

  const invAdmin = await prisma.user.upsert({
    where: { email: 'inv.admin@inventorypro.com' },
    update: { password: hashedPassword },
    create: {
      email: 'inv.admin@inventorypro.com',
      password: hashedPassword,
      name: 'Inventory Admin',
      role: 'INVENTORY_ADMIN',
      status: 'ACTIVE',
    },
  })

  const storeKeeper = await prisma.user.upsert({
    where: { email: 'storekeeper@inventorypro.com' },
    update: { password: hashedPassword },
    create: {
      email: 'storekeeper@inventorypro.com',
      password: hashedPassword,
      name: 'Store Keeper',
      role: 'STORE_KEEPER',
      status: 'ACTIVE',
      departmentId: itDept.id,
    },
  })

  const deptUser = await prisma.user.upsert({
    where: { email: 'dept.user@inventorypro.com' },
    update: { password: hashedPassword },
    create: {
      email: 'dept.user@inventorypro.com',
      password: hashedPassword,
      name: 'Department User',
      role: 'DEPARTMENT_USER',
      status: 'ACTIVE',
      departmentId: engineeringDept.id,
    },
  })

  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@inventorypro.com' },
    update: { password: hashedPassword },
    create: {
      email: 'viewer@inventorypro.com',
      password: hashedPassword,
      name: 'Viewer',
      role: 'VIEWER',
      status: 'ACTIVE',
    },
  })

  // Create Projects
  const erpProject = await prisma.project.upsert({
    where: { code: 'PRJ-001' },
    update: {},
    create: {
      name: 'ERP System Upgrade',
      code: 'PRJ-001',
      departmentId: itDept.id,
      description: 'Upgrading the company ERP system',
      status: 'ACTIVE',
    },
  })

  const infraProject = await prisma.project.upsert({
    where: { code: 'PRJ-002' },
    update: {},
    create: {
      name: 'Infrastructure Setup',
      code: 'PRJ-002',
      departmentId: engineeringDept.id,
      description: 'Setting up office infrastructure',
      status: 'ACTIVE',
    },
  })

  // Create Products
  const products = [
    {
      code: 'PRD-001',
      name: 'HP Laptop ProBook 450',
      sku: 'SKU-LPT-001',
      categoryId: electronicsCat.id,
      supplierId: techSupplier.id,
      unit: 'pcs',
      minimumStock: 5,
      unitCost: 120000,
      storageLocation: 'Warehouse A - Shelf 1',
    },
    {
      code: 'PRD-002',
      name: 'Wireless Mouse Logitech MX',
      sku: 'SKU-MSE-001',
      categoryId: electronicsCat.id,
      supplierId: techSupplier.id,
      unit: 'pcs',
      minimumStock: 20,
      unitCost: 8000,
      storageLocation: 'Warehouse A - Shelf 2',
    },
    {
      code: 'PRD-003',
      name: 'A4 Paper Ream (500 sheets)',
      sku: 'SKU-PAP-001',
      categoryId: officeSuppliesCat.id,
      supplierId: officeSupplier.id,
      unit: 'ream',
      minimumStock: 50,
      unitCost: 600,
      storageLocation: 'Warehouse B - Shelf 1',
    },
    {
      code: 'PRD-004',
      name: 'Office Chair Ergonomic',
      sku: 'SKU-CHR-001',
      categoryId: furnitureCat.id,
      supplierId: officeSupplier.id,
      unit: 'pcs',
      minimumStock: 10,
      unitCost: 35000,
      storageLocation: 'Warehouse C - Section 1',
    },
    {
      code: 'PRD-005',
      name: 'USB Keyboard Mechanical',
      sku: 'SKU-KBD-001',
      categoryId: electronicsCat.id,
      supplierId: techSupplier.id,
      unit: 'pcs',
      minimumStock: 15,
      unitCost: 12000,
      storageLocation: 'Warehouse A - Shelf 3',
    },
  ]

  for (const productData of products) {
    await prisma.product.upsert({
      where: { code: productData.code },
      update: {},
      create: productData,
    })
  }

  // Add some opening stock transactions
  const laptop = await prisma.product.findUnique({ where: { code: 'PRD-001' } })
  const mouse = await prisma.product.findUnique({ where: { code: 'PRD-002' } })
  const paper = await prisma.product.findUnique({ where: { code: 'PRD-003' } })
  const chair = await prisma.product.findUnique({ where: { code: 'PRD-004' } })
  const keyboard = await prisma.product.findUnique({ where: { code: 'PRD-005' } })

  const stockItems = [
    { product: laptop, qty: 10, cost: 120000 },
    { product: mouse, qty: 30, cost: 8000 },
    { product: paper, qty: 100, cost: 600 },
    { product: chair, qty: 15, cost: 35000 },
    { product: keyboard, qty: 25, cost: 12000 },
  ]

  for (const item of stockItems) {
    if (!item.product) continue
    // Check if opening stock already exists
    const existing = await prisma.inventoryTransaction.findFirst({
      where: { productId: item.product.id, type: 'OPENING_STOCK' },
    })
    if (!existing) {
      await prisma.inventoryTransaction.create({
        data: {
          productId: item.product.id,
          type: 'OPENING_STOCK',
          quantity: item.qty,
          unitCost: item.cost,
          reference: 'Initial Stock',
          remarks: 'Opening balance for demo',
        },
      })
    }
  }

  console.log('✅ Seeding completed successfully!')
  console.log('  Users: 5 demo accounts created')
  console.log('  Departments: 3 departments created')
  console.log('  Categories: 3 categories created')
  console.log('  Suppliers: 2 suppliers created')
  console.log('  Projects: 2 projects created')
  console.log('  Products: 5 products created')
  console.log('  Opening Stock: 5 items stocked')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed error:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
