import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// POST /api/inventory-items/import — Import inventory items from Excel file
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
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ]
    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return Response.json({ error: 'Invalid file type. Please upload an Excel file (.xlsx)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const sheet = workbook.worksheets[0]
    if (!sheet || sheet.rowCount < 2) {
      return Response.json({ error: 'Excel file is empty or has no data rows' }, { status: 400 })
    }

    // Get header row and map column indices
    const headerRow = sheet.getRow(1)
    const headers: Record<string, number> = {}
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const value = String(cell.value || '').trim().toLowerCase()
      if (value.includes('item name')) headers.itemName = colNumber
      else if (value.includes('specification') || value.includes('spec')) headers.specification = colNumber
      else if (value.includes('unit')) headers.unit = colNumber
      else if (value.includes('quantity') || value.includes('qty') || value.includes('inventory')) headers.quantity = colNumber
      else if (value.includes('min') || value.includes('minimum stock') || value.includes('min stock')) headers.minimumStock = colNumber
      else if (value.includes('unit cost') || value.includes('cost') || value.includes('price')) headers.unitCost = colNumber
      else if (value.includes('warehouse')) headers.warehouse = colNumber
    })

    // Validate required columns
    if (headers.itemName === undefined) {
      return Response.json({ error: 'Missing required column: Item Name' }, { status: 400 })
    }

    let imported = 0
    let skipped = 0
    const errors: { row: number; error: string }[] = []

    // Process each data row
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum)

      // Skip completely empty rows
      const allEmpty = Array.from(row.values).every((v) => v === null || v === undefined || String(v).trim() === '')
      if (allEmpty) continue

      const getCellValue = (colIndex: number | undefined): string => {
        if (colIndex === undefined) return ''
        const cell = row.getCell(colIndex)
        const val = cell.value
        if (val === null || val === undefined) return ''
        // Handle formula results
        if (typeof val === 'object' && val !== null && 'result' in val) {
          return String((val as { result: unknown }).result ?? '')
        }
        return String(val).trim()
      }

      const itemName = getCellValue(headers.itemName)
      const specification = getCellValue(headers.specification)
      const unit = getCellValue(headers.unit) || 'pcs'
      const quantityStr = getCellValue(headers.quantity)
      const minimumStockStr = getCellValue(headers.minimumStock)
      const unitCostStr = getCellValue(headers.unitCost)
      const warehouse = getCellValue(headers.warehouse) || 'Main Warehouse'

      // Validate item name
      if (!itemName) {
        errors.push({ row: rowNum, error: 'Item name is empty' })
        skipped++
        continue
      }

      // Parse numeric values
      const quantity = parseInt(quantityStr, 10)
      const minimumStock = parseInt(minimumStockStr, 10)
      const unitCost = parseFloat(unitCostStr)

      if (quantityStr && isNaN(quantity)) {
        errors.push({ row: rowNum, error: `Invalid quantity value: "${quantityStr}"` })
        skipped++
        continue
      }

      if (minimumStockStr && isNaN(minimumStock)) {
        errors.push({ row: rowNum, error: `Invalid minimum stock value: "${minimumStockStr}"` })
        skipped++
        continue
      }

      if (unitCostStr && isNaN(unitCost)) {
        errors.push({ row: rowNum, error: `Invalid unit cost value: "${unitCostStr}"` })
        skipped++
        continue
      }

      try {
        await db.inventoryItem.create({
          data: {
            itemName,
            specification: specification || '',
            unit,
            quantity: isNaN(quantity) ? 0 : quantity,
            minimumStock: isNaN(minimumStock) ? 0 : minimumStock,
            unitCost: isNaN(unitCost) ? 0 : unitCost,
            warehouse,
          },
        })
        imported++
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('Unique constraint')) {
          skipped++
          errors.push({
            row: rowNum,
            error: `Duplicate: "${itemName}" with spec "${specification}" in "${warehouse}" already exists`,
          })
        } else {
          errors.push({ row: rowNum, error: message })
        }
      }
    }

    return Response.json({ imported, skipped, errors })
  } catch (error) {
    console.error('POST /api/inventory-items/import error:', error)
    return Response.json({ error: 'Failed to import inventory items' }, { status: 500 })
  }
}
