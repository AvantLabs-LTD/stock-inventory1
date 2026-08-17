import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { isUploadTooLarge, MAX_UPLOAD_LABEL } from '@/lib/upload-limits'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── Column mapping: flexible header matching ───────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  itemName: ['item name', 'item_name', 'item', 'name', 'product name', 'product_name', 'product'],
  specification: ['specification', 'spec', 'size', 'model', 'type', 'variant', 'description'],
  unit: ['unit', 'uom', 'measurement'],
  quantity: ['quantity', 'qty', 'stock', 'inventory', 'opening stock', 'opening_stock', 'current stock', 'current_stock', 'on hand', 'on_hand', 'available'],
  issuedQty: ['issued', 'issued qty', 'issued_qty', 'issued quantity', 'issued_quantity', 'total issued'],
  reservedQty: ['reserved', 'reserved qty', 'reserved_qty', 'reserved quantity', 'reserved_quantity'],
  minimumStock: ['min stock', 'min_stock', 'minimum stock', 'minimum_stock', 'reorder level', 'reorder_level', 'reorder', 'alert level'],
  unitCost: ['unit cost', 'unit_cost', 'cost', 'price', 'rate', 'unit price', 'unit_price'],
  warehouse: ['warehouse', 'location', 'store', 'godown', 'wh'],
  category: ['category', 'category name', 'category_name', 'group', 'classification'],
  remarks: ['remarks', 'notes', 'comment', 'comments', 'description'],
}

/** Build a map from DB field name → Excel column index. Never fails. */
function mapColumns(headerRow: ExcelJS.Row): Record<string, number> {
  const mapping: Record<string, number> = {}
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const header = String(cell.value || '').trim().toLowerCase()
    if (!header) return
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (mapping[field] !== undefined) continue
      const sortedAliases = [...aliases].sort((a, b) => b.length - a.length)
      for (const alias of sortedAliases) {
        if (header === alias || header === alias.replace(/\s+/g, '_')) {
          mapping[field] = colNumber
          break
        }
      }
      if (mapping[field] !== undefined) continue
    }
  })
  return mapping
}

function getCellString(row: ExcelJS.Row, colIndex: number | undefined): string {
  if (colIndex === undefined) return ''
  const cell = row.getCell(colIndex)
  const val = cell.value
  if (val === null || val === undefined) return ''
  if (typeof val === 'object' && val !== null && 'result' in val) {
    return String((val as { result: unknown }).result ?? '').trim()
  }
  return String(val).trim()
}

function parseNum(str: string): number {
  if (!str) return 0
  const cleaned = str.replace(/[,\s]/g, '')
  const n = Number(cleaned)
  return isNaN(n) ? 0 : n
}

/** Auto-create a Category if it doesn't exist */
async function ensureCategory(name: string): Promise<string | null> {
  if (!name) return null
  const existing = await db.category.findUnique({ where: { name } })
  if (existing) return existing.id
  const code = name.toUpperCase().replace(/\s+/g, '_').slice(0, 20)
  const created = await db.category.create({
    data: { name, code },
  })
  return created.id
}

/** Auto-create a Product (parent) if it doesn't exist */
async function ensureProduct(itemName: string, categoryId: string | null): Promise<string> {
  const existing = await db.product.findFirst({
    where: {
      name: itemName,
      parentProductId: null,
      status: 'ACTIVE',
    },
  })
  if (existing) return existing.id

  const code = itemName.toUpperCase().replace(/\s+/g, '_').slice(0, 20) + '_' + Date.now().toString(36)
  const sku = 'SKU-' + code
  const created = await db.product.create({
    data: {
      name: itemName,
      code,
      sku,
      categoryId,
      unit: 'pcs',
      status: 'ACTIVE',
    },
  })
  return created.id
}

/** Auto-create a Product variant if it doesn't exist */
async function ensureProductVariant(specName: string, parentProductId: string): Promise<string | null> {
  if (!specName || specName === '-') return null
  const existing = await db.product.findFirst({
    where: {
      parentProductId,
      variantName: specName,
      status: 'ACTIVE',
    },
  })
  if (existing) return existing.id

  const code = specName.toUpperCase().replace(/\s+/g, '_').slice(0, 20) + '_' + Date.now().toString(36)
  const sku = 'SKU-' + code
  const created = await db.product.create({
    data: {
      name: specName,
      code,
      sku,
      parentProductId,
      variantName: specName,
      unit: 'pcs',
      status: 'ACTIVE',
    },
  })
  return created.id
}

// POST /api/inventory-items/import — Bulletproof Excel import
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('No permission to manage inventory items')
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    if (isUploadTooLarge(file)) {
      return Response.json({ error: `File is too large. Maximum upload size is ${MAX_UPLOAD_LABEL}.` }, { status: 413 })
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      return Response.json({ error: 'Invalid file type. Please upload an Excel file (.xlsx, .xls)' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(arrayBuffer) as never)

    const sheet = workbook.worksheets[0]
    if (!sheet || sheet.rowCount < 2) {
      return Response.json({ error: 'Excel file is empty or has no data rows' }, { status: 400 })
    }

    const headerRow = sheet.getRow(1)
    const colMap = mapColumns(headerRow)

    let imported = 0
    let skipped = 0
    let productsCreated = 0
    let categoriesCreated = 0
    const warnings: { row: number; message: string }[] = []

    // Track created products/categories to avoid duplicates within the same import
    const productCache = new Map<string, string>()   // itemName → productId
    const variantCache = new Map<string, string>()    // "productId:spec" → variantId
    const categoryCache = new Map<string, string>()   // categoryName → categoryId

    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum)

      let allEmpty = true
      row.eachCell({ includeEmpty: true }, () => { allEmpty = false })
      if (allEmpty) continue

      const itemName = getCellString(row, colMap.itemName)
      const specification = getCellString(row, colMap.specification)
      const unit = getCellString(row, colMap.unit) || 'pcs'
      const quantity = parseNum(getCellString(row, colMap.quantity))
      const issuedQty = parseNum(getCellString(row, colMap.issuedQty))
      const reservedQty = parseNum(getCellString(row, colMap.reservedQty))
      const minimumStock = parseNum(getCellString(row, colMap.minimumStock))
      const unitCost = parseNum(getCellString(row, colMap.unitCost))
      const warehouse = getCellString(row, colMap.warehouse) || 'Main Warehouse'
      const category = getCellString(row, colMap.category)
      const remarks = getCellString(row, colMap.remarks)

      if (!itemName) {
        skipped++
        warnings.push({ row: rowNum, message: `Row ${rowNum}: Skipped — no Item Name found` })
        continue
      }

      try {
        // Auto-create Category if needed
        let categoryId: string | null = null
        if (category && !categoryCache.has(category)) {
          categoryId = await ensureCategory(category)
          if (categoryId) {
            categoryCache.set(category, categoryId)
            categoriesCreated++
          }
        } else if (category) {
          categoryId = categoryCache.get(category) || null
        }

        // Auto-create Product (parent) if needed
        if (!productCache.has(itemName)) {
          const productId = await ensureProduct(itemName, categoryId)
          productCache.set(itemName, productId)
          productsCreated++
        }
        const productId = productCache.get(itemName)!

        // Auto-create Product variant if needed
        if (specification && specification !== '-' && !variantCache.has(`${productId}:${specification}`)) {
          const variantId = await ensureProductVariant(specification, productId)
          if (variantId) {
            variantCache.set(`${productId}:${specification}`, variantId)
          }
        }

        // Create or skip InventoryItem
        await db.inventoryItem.create({
          data: {
            itemName,
            specification: specification || '-',
            unit,
            quantity,
            issuedQty,
            reservedQty,
            minimumStock,
            unitCost,
            warehouse,
            remarks: remarks || null,
            ...(quantity > 0 ? { lastTransactionAt: new Date() } : {}),
          },
        })
        imported++
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('Unique constraint')) {
          skipped++
          warnings.push({ row: rowNum, message: `Duplicate: "${itemName}" / "${specification || '-'}" in "${warehouse}" — skipped` })
        } else {
          skipped++
          warnings.push({ row: rowNum, message: `Error: ${message}` })
        }
      }
    }

    return Response.json({
      imported,
      skipped,
      productsCreated,
      categoriesCreated,
      warnings,
      columnMapping: colMap,
    })
  } catch (error) {
    console.error('POST /api/inventory-items/import error:', error)
    return Response.json({ error: 'Failed to import inventory items' }, { status: 500 })
  }
}
