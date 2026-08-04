import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// Allow larger body for file uploads
export const maxDuration = 60

// POST /api/stock/opening/import — Import opening stock from Excel/CSV
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can import opening stock')
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ error: 'No file uploaded. Please provide an Excel or CSV file.' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      return Response.json({ error: 'Only .xlsx, .xls, and .csv files are supported' }, { status: 400 })
    }

    if (file.size === 0) {
      return Response.json({ error: 'The uploaded file is empty.' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return Response.json({ error: 'File is too large. Maximum size is 50 MB.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = new ExcelJS.Workbook()
    let sheet: ExcelJS.Worksheet | undefined

    if (fileName.endsWith('.csv')) {
      // For CSV, we read it as text and parse into a worksheet
      const text = buffer.toString('utf-8')
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) {
        return Response.json({ error: 'CSV file is empty or has no data rows' }, { status: 400 })
      }
      sheet = workbook.addWorksheet('Import')
      const headers = parseCSVLine(lines[0])
      sheet.addRow(headers)
      for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i])
        sheet.addRow(vals)
      }
    } else {
      await workbook.xlsx.load(buffer)
      sheet = workbook.worksheets[0]
    }

    if (!sheet || sheet.rowCount < 2) {
      return Response.json({ error: 'File is empty or has no data rows' }, { status: 400 })
    }

    // Read header row to find column indices
    const headerRow = sheet.getRow(1)
    const headerMap = new Map<string, number>()
    // Track model/project columns (e.g., AUJ-CHS, BL-CHS, etc.)
    const modelColumns = new Map<string, number>()

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = String(cell.value || '').trim()
      const lower = header.toLowerCase()

      if (lower.includes('name') && !lower.includes('product name')) headerMap.set('name', colNumber)
      else if (lower.includes('spec') || lower.includes('sku') || lower.includes('part') || lower.includes('description')) headerMap.set('specification', colNumber)
      else if (lower.includes('categ')) headerMap.set('category', colNumber)
      else if (lower.includes('unit') || lower.includes('a/u') || lower.includes('uom')) headerMap.set('unit', colNumber)
      else if (lower.includes('qty') || lower.includes('quantity') || lower.includes('opening') || lower.includes('stock')) headerMap.set('quantity', colNumber)
      else if (lower.includes('remark') || lower.includes('note') || lower.includes('comment')) headerMap.set('remarks', colNumber)
      else if (lower.includes('batch') || lower.includes('lot')) headerMap.set('batch', colNumber)
      else if (lower.includes('warehouse') || lower.includes('wh')) headerMap.set('warehouse', colNumber)
      else if (lower.includes('supplier') || lower.includes('vendor')) headerMap.set('supplier', colNumber)
      else if (lower.includes('location') || lower.includes('shelf') || lower.includes('bin')) headerMap.set('location', colNumber)
      // Anything else that looks like a model/project code is treated as a model column
      else if (header.length > 0) {
        modelColumns.set(header, colNumber)
      }
    })

    // If we didn't find 'quantity' but have model columns, this is a BOM file
    // In BOM files, each model column contains quantities per model
    const isBOMFile = !headerMap.has('quantity') && modelColumns.size > 0

    if (!headerMap.has('name')) {
      return Response.json({ error: 'Missing required column: Name (or similar header containing "name")' }, { status: 400 })
    }

    if (!headerMap.has('quantity') && !isBOMFile) {
      return Response.json({ error: 'Missing required column: Quantity (or similar header containing "quantity", "qty", or "stock"). BOM files with model columns are auto-detected.' }, { status: 400 })
    }

    const nameCol = headerMap.get('name')!
    const specCol = headerMap.get('specification')
    const catCol = headerMap.get('category')
    const unitCol = headerMap.get('unit')
    const qtyCol = headerMap.get('quantity')
    const remarksCol = headerMap.get('remarks')
    const batchCol = headerMap.get('batch')
    const warehouseCol = headerMap.get('warehouse')
    const supplierCol = headerMap.get('supplier')
    const locationCol = headerMap.get('location')

    const results = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      isBOM: isBOMFile,
      modelsDetected: isBOMFile ? Array.from(modelColumns.keys()) : [],
    }

    // Process each data row
    for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) {
      const row = sheet.getRow(rowIndex)

      const name = getCellStringValue(row.getCell(nameCol))
      const specification = specCol ? getCellStringValue(row.getCell(specCol)) : ''
      const categoryName = catCol ? getCellStringValue(row.getCell(catCol)) : ''
      const unit = unitCol ? getCellStringValue(row.getCell(unitCol)) : 'pcs'
      const batchNumber = batchCol ? getCellStringValue(row.getCell(batchCol)) : ''
      const warehouse = warehouseCol ? getCellStringValue(row.getCell(warehouseCol)) : ''
      const supplierName = supplierCol ? getCellStringValue(row.getCell(supplierCol)) : ''
      const location = locationCol ? getCellStringValue(row.getCell(locationCol)) : ''
      const remarks = remarksCol ? getCellStringValue(row.getCell(remarksCol)) : ''

      // Skip empty rows
      if (!name && !specification) continue
      if (!name) {
        results.errors.push(`Row ${rowIndex}: Missing product name`)
        results.skipped++
        continue
      }

      try {
        // Auto-create category if needed
        let categoryId: string | null = null
        if (categoryName) {
          let category = await db.category.findUnique({ where: { name: categoryName } })
          if (!category) {
            const code = 'CAT-' + categoryName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
            category = await db.category.create({
              data: { name: categoryName, code, status: 'ACTIVE' },
            })
          }
          categoryId = category.id
        }

        // Auto-create supplier if needed
        let supplierId: string | null = null
        if (supplierName) {
          let supplier = await db.supplier.findFirst({ where: { name: supplierName } })
          if (!supplier) {
            supplier = await db.supplier.create({
              data: { name: supplierName, code: 'SUP-' + supplierName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8), contactPerson: '', email: '', phone: '', status: 'ACTIVE' },
            })
          }
          supplierId = supplier.id
        }

        // Generate SKU from specification
        const sku = specification
          ? specification.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 20)
          : `SKU-${name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)}`

        // Generate a unique code
        const code = `P-${name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)}-${Date.now()}`

        // Auto-create or find product
        let product = await db.product.findFirst({
          where: { name, sku },
          select: { id: true, name: true },
        })

        if (!product) {
          // Ensure unique code
          let uniqueCode = code
          let codeExists = await db.product.findUnique({ where: { code: uniqueCode } })
          let attempt = 0
          while (codeExists && attempt < 10) {
            attempt++
            uniqueCode = `${code}-${attempt}`
            codeExists = await db.product.findUnique({ where: { code: uniqueCode } })
          }

          // Ensure unique sku
          let uniqueSku = sku
          let skuExists = await db.product.findUnique({ where: { sku: uniqueSku } })
          attempt = 0
          while (skuExists && attempt < 10) {
            attempt++
            uniqueSku = `${sku}-${attempt}`
            skuExists = await db.product.findUnique({ where: { sku: uniqueSku } })
          }

          product = await db.product.create({
            data: {
              name,
              code: uniqueCode,
              sku: uniqueSku,
              unit: unit || 'pcs',
              categoryId,
              supplierId,
              status: 'ACTIVE',
            },
            select: { id: true, name: true },
          })
        } else if (supplierId) {
          // Update supplier on existing product if provided
          await db.product.update({ where: { id: product.id }, data: { supplierId } })
        }

        if (isBOMFile) {
          // BOM file: each model column is a separate quantity entry
          let rowImported = 0
          for (const [modelName, colNum] of modelColumns) {
            const rawQty = row.getCell(colNum).value
            const quantity = parseQuantity(rawQty)
            if (quantity && quantity > 0) {
              const bomRemarks = `${remarks ? remarks + ' | ' : ''}[${modelName}] ${quantity} ${unit || 'pcs'}`

              // Check for existing opening stock for this product+model combination
              const existingOpening = await db.inventoryTransaction.findFirst({
                where: { productId: product.id, type: 'OPENING_STOCK', remarks: { contains: modelName } },
              })

              if (existingOpening) {
                await db.inventoryTransaction.update({
                  where: { id: existingOpening.id },
                  data: { quantity, remarks: bomRemarks },
                })
                results.updated++
              } else {
                await db.inventoryTransaction.create({
                  data: {
                    productId: product.id,
                    type: 'OPENING_STOCK',
                    quantity,
                    remarks: bomRemarks,
                  },
                })
                results.imported++
              }
              rowImported++
            }
          }
          if (rowImported === 0) {
            results.errors.push(`Row ${rowIndex} (${name}): No quantities found in any model column`)
            results.skipped++
          }
        } else {
          // Standard file: single quantity column
          const rawQty = qtyCol ? row.getCell(qtyCol).value : null
          const quantity = parseQuantity(rawQty)
          if (!quantity || quantity <= 0) {
            results.errors.push(`Row ${rowIndex} (${name}): Invalid or zero quantity`)
            results.skipped++
            continue
          }

          // Build comprehensive remarks
          let fullRemarks = remarks || 'Opening stock entry (imported)'
          if (batchNumber) fullRemarks = `[Batch: ${batchNumber}] ${fullRemarks}`
          if (warehouse) fullRemarks = `[WH: ${warehouse}] ${fullRemarks}`
          if (location) fullRemarks = `[Loc: ${location}] ${fullRemarks}`

          // Check for existing opening stock
          const existingOpening = await db.inventoryTransaction.findFirst({
            where: { productId: product.id, type: 'OPENING_STOCK' },
          })

          if (existingOpening) {
            await db.inventoryTransaction.update({
              where: { id: existingOpening.id },
              data: { quantity, remarks: fullRemarks },
            })
            results.updated++
          } else {
            await db.inventoryTransaction.create({
              data: {
                productId: product.id,
                type: 'OPENING_STOCK',
                quantity,
                remarks: fullRemarks,
              },
            })
            results.imported++
          }
        }
      } catch (rowError) {
        console.error(`Error processing row ${rowIndex} (${name}):`, rowError)
        results.errors.push(`Row ${rowIndex} (${name}): ${rowError instanceof Error ? rowError.message : 'Unknown error'}`)
        results.skipped++
      }
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'OPENING_STOCK_IMPORTED',
        entityType: 'InventoryTransaction',
        details: `Imported opening stock from ${file.name}: ${results.imported} new, ${results.updated} updated, ${results.skipped} skipped${isBOMFile ? ` (BOM mode, models: ${results.modelsDetected.join(', ')})` : ''}`,
      },
    })

    return Response.json({
      success: true,
      message: `Import complete: ${results.imported} imported, ${results.updated} updated, ${results.skipped} skipped`,
      ...results,
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/stock/opening/import error:', error)
    return Response.json({ error: `Failed to import: ${error instanceof Error ? error.message : 'Unknown error'}` }, { status: 500 })
  }
}

// Helper: get string value from a cell (handles various ExcelJS cell types)
function getCellStringValue(cell: ExcelJS.Cell): string {
  const val = cell.value
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return String(val)
  if (val instanceof Date) return val.toISOString().split('T')[0]
  // Handle rich text
  if (typeof val === 'object' && 'richText' in val && Array.isArray(val.richText)) {
    return val.richText.map((r: { text: string }) => r.text).join('').trim()
  }
  // Handle formula
  if (typeof val === 'object' && 'formula' in val) {
    return getCellStringValue({ ...cell, value: val.result } as ExcelJS.Cell)
  }
  // Handle hyperlink
  if (typeof val === 'object' && 'text' in val) {
    return String(val.text).trim()
  }
  return String(val).trim()
}

// Helper: parse quantity from various cell types
function parseQuantity(raw: ExcelJS.CellValue): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return raw
  const str = String(raw).trim().replace(/,/g, '')
  if (!str) return null
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

// Helper: parse a CSV line respecting quotes
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}
