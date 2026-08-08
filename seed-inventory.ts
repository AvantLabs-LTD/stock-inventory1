import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ log: ['query'] })

const PRODUCTS: { name: string; specs: { spec: string; unit: string; minStock: number }[] }[] = [
  {
    name: 'Connector',
    specs: [
      { spec: 'XT30-M', unit: 'pcs', minStock: 50 },
      { spec: 'XT30-F', unit: 'pcs', minStock: 50 },
      { spec: 'XT60-M', unit: 'pcs', minStock: 30 },
      { spec: 'XT60-F', unit: 'pcs', minStock: 30 },
      { spec: 'XT90-M', unit: 'pcs', minStock: 20 },
      { spec: 'XT90-F', unit: 'pcs', minStock: 20 },
      { spec: 'XT90BE-F', unit: 'pcs', minStock: 20 },
      { spec: 'MT60-F', unit: 'pcs', minStock: 20 },
      { spec: 'MT60-M', unit: 'pcs', minStock: 20 },
      { spec: 'MR60-M', unit: 'pcs', minStock: 20 },
      { spec: 'MR60-F', unit: 'pcs', minStock: 20 },
      { spec: 'JX 9+2-M', unit: 'pcs', minStock: 20 },
      { spec: 'JX 9+2-F', unit: 'pcs', minStock: 20 },
      { spec: '04R-JWPF-VSLE-S Male', unit: 'pcs', minStock: 30 },
      { spec: '04R-JWPF-VSLE-S Female', unit: 'pcs', minStock: 30 },
      { spec: '3 Pin Dupont-M', unit: 'pcs', minStock: 50 },
      { spec: '3 Pin Dupont-F', unit: 'pcs', minStock: 50 },
      { spec: '3 Pin Dupont Molex Locking-M', unit: 'pcs', minStock: 30 },
      { spec: '3 Pin Dupont Molex Locking-F', unit: 'pcs', minStock: 30 },
      { spec: '4 Pin Dupont Molex Locking-Male', unit: 'pcs', minStock: 30 },
      { spec: '4 Pin Dupont Molex Locking-Female', unit: 'pcs', minStock: 30 },
      { spec: 'Push Button', unit: 'pcs', minStock: 20 },
      { spec: 'Antenna', unit: 'pcs', minStock: 10 },
      { spec: 'Ferrite Squib Connector', unit: 'pcs', minStock: 10 },
      { spec: 'DB15-F', unit: 'pcs', minStock: 10 },
      { spec: 'DB15-M', unit: 'pcs', minStock: 10 },
      { spec: 'DB9-F', unit: 'pcs', minStock: 10 },
      { spec: 'DB9-M', unit: 'pcs', minStock: 10 },
    ],
  },
  {
    name: 'Braided Sleeve',
    specs: [
      { spec: '30mm', unit: 'mtr', minStock: 5 },
      { spec: '25mm', unit: 'mtr', minStock: 5 },
      { spec: '20mm', unit: 'mtr', minStock: 5 },
      { spec: '16mm', unit: 'mtr', minStock: 5 },
      { spec: '14mm', unit: 'mtr', minStock: 5 },
      { spec: '12mm', unit: 'mtr', minStock: 5 },
      { spec: '10mm', unit: 'mtr', minStock: 10 },
      { spec: '8mm', unit: 'mtr', minStock: 10 },
      { spec: '6mm', unit: 'mtr', minStock: 10 },
      { spec: '4mm', unit: 'mtr', minStock: 10 },
      { spec: '2.5mm', unit: 'mtr', minStock: 10 },
    ],
  },
  {
    name: 'Heat Shrink Tube',
    specs: [
      { spec: 'Glue Red 8mm', unit: 'mtr', minStock: 5 },
      { spec: 'Glue Black 8mm', unit: 'mtr', minStock: 5 },
      { spec: '1.5mm', unit: 'mtr', minStock: 10 },
      { spec: '2mm', unit: 'mtr', minStock: 10 },
      { spec: '3mm', unit: 'mtr', minStock: 10 },
      { spec: '5mm', unit: 'mtr', minStock: 10 },
    ],
  },
  {
    name: 'Wire',
    specs: [
      { spec: 'PTFE 0.2mm', unit: 'mtr', minStock: 20 },
      { spec: 'Red 12 AWG', unit: 'mtr', minStock: 10 },
      { spec: 'Black 12 AWG', unit: 'mtr', minStock: 10 },
    ],
  },
  {
    name: 'Soldering Wire',
    specs: [
      { spec: '0.4mm', unit: 'roll', minStock: 3 },
      { spec: '0.5mm', unit: 'roll', minStock: 3 },
      { spec: '1mm', unit: 'roll', minStock: 3 },
    ],
  },
  {
    name: 'Harness Tape',
    specs: [
      { spec: '2cm', unit: 'roll', minStock: 3 },
      { spec: '2.5cm', unit: 'roll', minStock: 3 },
      { spec: '3cm', unit: 'roll', minStock: 3 },
      { spec: '3.8cm (1×25m)', unit: 'roll', minStock: 2 },
      { spec: '3.8cm (1×55m)', unit: 'roll', minStock: 2 },
    ],
  },
  {
    name: 'STJP',
    specs: [
      { spec: '2 Core', unit: 'mtr', minStock: 10 },
      { spec: '4 Core', unit: 'mtr', minStock: 10 },
    ],
  },
  {
    name: 'Antistatic Bags',
    specs: [
      { spec: '10×10cm', unit: 'pcs', minStock: 50 },
      { spec: '15×25cm', unit: 'pcs', minStock: 30 },
      { spec: '25×30cm', unit: 'pcs', minStock: 20 },
      { spec: '50×60cm', unit: 'pcs', minStock: 10 },
    ],
  },
]

const SINGLE_ITEMS = [
  { name: 'Label Printer Cartage 12mm', spec: 'Default', unit: 'pcs', minStock: 5 },
  { name: 'Lacing Cord 1mm', spec: 'Default', unit: 'mtr', minStock: 10 },
  { name: 'Female Insulated Thimble', spec: 'Default', unit: 'pcs', minStock: 50 },
  { name: 'Thermal Pad 200×400×1mm', spec: 'Default', unit: 'pcs', minStock: 10 },
  { name: 'Cable Tie Holder', spec: 'Default', unit: 'pcs', minStock: 20 },
]

async function seed() {
  console.log('Seeding inventory items...')
  const deleted = await db.inventoryItem.deleteMany({})
  console.log(`Deleted ${deleted.count} existing items`)

  let created = 0
  const warehouse = 'Main Warehouse'

  for (const product of PRODUCTS) {
    for (const s of product.specs) {
      await db.inventoryItem.create({
        data: {
          itemName: product.name,
          specification: s.spec,
          unit: s.unit,
          quantity: 0,
          issuedQty: 0,
          reservedQty: 0,
          minimumStock: s.minStock,
          unitCost: 0,
          warehouse,
          status: 'ACTIVE',
        },
      })
      created++
    }
  }

  for (const item of SINGLE_ITEMS) {
    await db.inventoryItem.create({
      data: {
        itemName: item.name,
        specification: item.spec,
        unit: item.unit,
        quantity: 0,
        issuedQty: 0,
        reservedQty: 0,
        minimumStock: item.minStock,
        unitCost: 0,
        warehouse,
        status: 'ACTIVE',
      },
    })
    created++
  }

  console.log(`Created ${created} inventory items`)
  console.log('Done!')
  await db.$disconnect()
}

seed().catch((e) => { console.error(e); process.exit(1) })
