import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── Column mapping: flexible header matching ───────────────────────────
// Each DB field maps to an array of possible header substrings (case-insensitive)

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
}

/**
 * Build a map from DB field name → Excel column index.
 * Never fails — unknown headers are simply ignored.
 */
function mapColumns(headerRow: ExcelJS.Row): Record<string, number> {
  const mapping: Record<string, number> = {}

  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const header = String(cell.value || '').trim().toLowerCase()
    if (!header) return

    // Try exact alias match first (longer aliases first to avoid partial matches)
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (mapping[field] !== undefined) continue // already mapped
      // Sort aliases by length descending so "item name" matches before "item"
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

/** Safely extract a string from a cell */
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

/** Safely parse a number */
function parseNum(str: string): number {
  if (!str) return 0
  const cleaned = str.replace(/[,\s]/g, '')
  const n = Number(cleaned)
  return isNaN(n) ? 0 : n
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

    // Validate file type
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

    // Auto-map columns — never fails
    const headerRow = sheet.getRow(1)
    const colMap = mapColumns(headerRow)

    let imported = 0
    let skipped = 0
    const warnings: { row: number; message: string }[] = []

    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum)

      // Skip completely empty rows
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

      // Item name is the only truly required field
      if (!itemName) {
        skipped++
        warnings.push({ row: rowNum, message: `Row ${rowNum}: Skipped — no Item Name found (column may be missing or cell is empty)` })
        continue
      }

      try {
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
      warnings,
      columnMapping: colMap,
    })
  } catch (error) {
    console.error('POST /api/inventory-items/import error:', error)
    return Response.json({ error: 'Failed to import inventory items' }, { status: 500 })
  }
}
