import { db } from '../src/lib/db.js'

const SEED_DATA: { itemName: string; specs: { specification: string; unit: string; minimumStock: number }[] }[] = [
  {
    itemName: 'Connector',
    specs: [
      { specification: 'XT30-M', unit: 'pcs', minimumStock: 50 },
      { specification: 'XT30-F', unit: 'pcs', minimumStock: 50 },
      { specification: 'XT60-M', unit: 'pcs', minimumStock: 30 },
      { specification: 'XT60-F', unit: 'pcs', minimumStock: 30 },
      { specification: 'XT90-M', unit: 'pcs', minimumStock: 20 },
      { specification: 'XT90-F', unit: 'pcs', minimumStock: 20 },
      { specification: 'XT90BE-F', unit: 'pcs', minimumStock: 20 },
      { specification: 'MT60-F', unit: 'pcs', minimumStock: 20 },
      { specification: 'MT60-M', unit: 'pcs', minimumStock: 20 },
      { specification: 'MR60-M', unit: 'pcs', minimumStock: 20 },
      { specification: 'MR60-F', unit: 'pcs', minimumStock: 20 },
      { specification: 'JX 9+2-M', unit: 'pcs', minimumStock: 20 },
      { specification: 'JX 9+2-F', unit: 'pcs', minimumStock: 20 },
      { specification: '04R-JWPF-VSLE-S Male', unit: 'pcs', minimumStock: 15 },
      { specification: '04R-JWPF-VSLE-S Female', unit: 'pcs', minimumStock: 15 },
      { specification: '3 Pin Dupont-M', unit: 'pcs', minimumStock: 100 },
      { specification: '3 Pin Dupont-F', unit: 'pcs', minimumStock: 100 },
      { specification: '3 Pin Dupont Molex Locking-M', unit: 'pcs', minimumStock: 50 },
      { specification: '3 Pin Dupont Molex Locking-F', unit: 'pcs', minimumStock: 50 },
      { specification: '4 Pin Dupont Molex Locking-Male', unit: 'pcs', minimumStock: 50 },
      { specification: '4 Pin Dupont Molex Locking-Female', unit: 'pcs', minimumStock: 50 },
      { specification: 'Push Button', unit: 'pcs', minimumStock: 30 },
      { specification: 'Antenna', unit: 'pcs', minimumStock: 10 },
      { specification: 'Ferrite Squib Connector', unit: 'pcs', minimumStock: 20 },
      { specification: 'DB15-F', unit: 'pcs', minimumStock: 10 },
      { specification: 'DB15-M', unit: 'pcs', minimumStock: 10 },
      { specification: 'DB9-F', unit: 'pcs', minimumStock: 10 },
      { specification: 'DB9-M', unit: 'pcs', minimumStock: 10 },
    ],
  },
  {
    itemName: 'Braided Sleeve',
    specs: [
      { specification: '30mm', unit: 'mtr', minimumStock: 10 },
      { specification: '25mm', unit: 'mtr', minimumStock: 10 },
      { specification: '20mm', unit: 'mtr', minimumStock: 15 },
      { specification: '16mm', unit: 'mtr', minimumStock: 15 },
      { specification: '14mm', unit: 'mtr', minimumStock: 15 },
      { specification: '12mm', unit: 'mtr', minimumStock: 20 },
      { specification: '10mm', unit: 'mtr', minimumStock: 20 },
      { specification: '8mm', unit: 'mtr', minimumStock: 20 },
      { specification: '6mm', unit: 'mtr', minimumStock: 25 },
      { specification: '4mm', unit: 'mtr', minimumStock: 25 },
      { specification: '2.5mm', unit: 'mtr', minimumStock: 25 },
    ],
  },
  {
    itemName: 'Heat Shrink Tube',
    specs: [
      { specification: 'Glue Red 8mm', unit: 'mtr', minimumStock: 20 },
      { specification: 'Glue Black 8mm', unit: 'mtr', minimumStock: 20 },
      { specification: '1.5mm', unit: 'mtr', minimumStock: 30 },
      { specification: '2mm', unit: 'mtr', minimumStock: 30 },
      { specification: '3mm', unit: 'mtr', minimumStock: 25 },
      { specification: '5mm', unit: 'mtr', minimumStock: 25 },
    ],
  },
  {
    itemName: 'Wire',
    specs: [
      { specification: 'PTFE 0.2mm', unit: 'mtr', minimumStock: 100 },
      { specification: 'Red 12 AWG', unit: 'mtr', minimumStock: 50 },
      { specification: 'Black 12 AWG', unit: 'mtr', minimumStock: 50 },
    ],
  },
  {
    itemName: 'Soldering Wire',
    specs: [
      { specification: '0.4mm', unit: 'roll', minimumStock: 5 },
      { specification: '0.5mm', unit: 'roll', minimumStock: 5 },
      { specification: '1mm', unit: 'roll', minimumStock: 3 },
    ],
  },
  {
    itemName: 'Harness Tape',
    specs: [
      { specification: '2cm', unit: 'roll', minimumStock: 5 },
      { specification: '2.5cm', unit: 'roll', minimumStock: 5 },
      { specification: '3cm', unit: 'roll', minimumStock: 5 },
      { specification: '3.8cm (1×25m)', unit: 'roll', minimumStock: 3 },
      { specification: '3.8cm (1×55m)', unit: 'roll', minimumStock: 3 },
    ],
  },
  {
    itemName: 'STJP',
    specs: [
      { specification: '2 Core', unit: 'mtr', minimumStock: 50 },
      { specification: '4 Core', unit: 'mtr', minimumStock: 50 },
    ],
  },
  {
    itemName: 'Antistatic Bags',
    specs: [
      { specification: '10×10cm', unit: 'pcs', minimumStock: 100 },
      { specification: '15×25cm', unit: 'pcs', minimumStock: 100 },
      { specification: '25×30cm', unit: 'pcs', minimumStock: 50 },
      { specification: '50×60cm', unit: 'pcs', minimumStock: 30 },
    ],
  },
]

// Single items (no specs / one spec each)
const SINGLE_ITEMS: { itemName: string; specification: string; unit: string; minimumStock: number }[] = [
  { itemName: 'Label Printer Cartage 12mm', specification: 'Standard', unit: 'pcs', minimumStock: 3 },
  { itemName: 'Lacing Cord 1mm', specification: 'Standard', unit: 'mtr', minimumStock: 50 },
  { itemName: 'Female Insulated Thimble', specification: 'Standard', unit: 'pcs', minimumStock: 100 },
  { itemName: 'Thermal Pad 200×400×1mm', specification: '200×400×1mm', unit: 'pcs', minimumStock: 10 },
  { itemName: 'Cable Tie Holder', specification: 'Standard', unit: 'pcs', minimumStock: 50 },
]

async function seed() {
  console.log('🌱 Seeding inventory items...')

  const warehouse = 'Main Warehouse'
  let created = 0
  let skipped = 0

  for (const item of SEED_DATA) {
    for (const spec of item.specs) {
      try {
        await db.inventoryItem.create({
          data: {
            itemName: item.itemName,
            specification: spec.specification,
            unit: spec.unit,
            minimumStock: spec.minimumStock,
            warehouse,
          },
        })
        created++
      } catch {
        skipped++
      }
    }
  }

  for (const item of SINGLE_ITEMS) {
    try {
      await db.inventoryItem.create({
        data: {
          itemName: item.itemName,
          specification: item.specification,
          unit: item.unit,
          minimumStock: item.minimumStock,
          warehouse,
        },
      })
      created++
    } catch {
      skipped++
    }
  }

  console.log(`✅ Done! Created: ${created}, Skipped (existing): ${skipped}`)
  const total = await db.inventoryItem.count({ where: { status: 'ACTIVE' } })
  console.log(`📊 Total active inventory items: ${total}`)
}

seed()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(() => process.exit(0))
