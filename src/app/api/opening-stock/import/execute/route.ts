import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

export const maxDuration = 120

// ─── POST /api/opening-stock/import/execute — Execute import ────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can import')
    }

    const body = await request.json()
    const { fileData, fileName, columnMapping, sheetName, projectFields } = body

    if (!fileData) {
      return Response.json({ error: 'No file data provided' }, { status: 400 })
    }

    if (!columnMapping || !columnMapping.name) {
      return Response.json({ error: 'Column mapping is required with at least "name" field' }, { status: 400 })
    }

    // Decode base64 file data
    const buffer = Buffer.from(fileData, 'base64')
    const workbook = new ExcelJS.Workbook()
    const fileExt = (fileName || '').toLowerCase()

    let sheet: ExcelJS.Worksheet | undefined
    if (fileExt.endsWith('.csv')) {
      const text = buffer.toString('utf-8')
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      sheet = workbook.addWorksheet('Import')
      sheet.addRow(parseCSVLine(lines[0]))
      for (let i = 1; i < lines.length; i++) {
        sheet.addRow(parseCSVLine(lines[i]))
      }
    } else {
      await workbook.xlsx.load(buffer)
      if (sheetName) {
        sheet = workbook.worksheets.find((s) => s.name === sheetName) || workbook.worksheets[0]
      } else {
        sheet = workbook.worksheets[0]
      }
    }

    if (!sheet || sheet.rowCount < 2) {
      return Response.json({ error: 'No data rows found' }, { status: 400 })
    }

    const mapping = columnMapping
    const extraCols = mapping.extra || {}

    // Ensure project fields exist
    const resolvedProjectFields: Map<string, string> = new Map()
    if (projectFields && Array.isArray(projectFields)) {
      for (const pf of projectFields) {
        if (!pf.name) continue
        const existing = await db.projectField.findFirst({
          where: { name: pf.name },
        })
        if (existing) {
          resolvedProjectFields.set(pf.name, existing.id)
        } else {
          const code = pf.code || generateCodeFromName(pf.name)
          const created = await db.projectField.create({
            data: { name: pf.name, code },
          })
          resolvedProjectFields.set(pf.name, created.id)
        }
      }
    }

    // Parse header row for column indices
    const headerRow = sheet.getRow(1)
    const colIndexMap = new Map<string, number>()

    // Map standard columns by index from the mapping
    for (const [field, value] of Object.entries(mapping)) {
      if (field === 'extra') continue
      if (typeof value === 'number') {
        colIndexMap.set(field, value)
      }
    }

    // Map extra columns
    for (const [colName, value] of Object.entries(extraCols)) {
      if (typeof value === 'number') {
        colIndexMap.set(`extra_${colName}`, value)
      }
    }

    // Results tracking
    const results = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errorCount: 0,
      warningCount: 0,
      errors: [] as string[],
      warnings: [] as string[],
    }

    const startTime = Date.now()

    // Create ImportBatch
    const importBatch = await db.importBatch.create({
      data: {
        fileName: fileName || 'import.xlsx',
        sheetName: sheetName || sheet.name,
        totalRows: sheet.rowCount - 1,
        importedById: session.user.id,
        columnMapping: JSON.stringify(mapping),
        status: 'PROCESSING',
      },
    })

    // Process rows
    for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) {
      const row = sheet.getRow(rowIndex)

      const name = colIndexMap.has('name')
        ? getCellStringValue(row.getCell(colIndexMap.get('name')!))
        : ''

      if (!name.trim()) continue

      try {
        const specification = colIndexMap.has('specification')
          ? getCellStringValue(row.getCell(colIndexMap.get('specification')!))
          : ''
        const categoryName = colIndexMap.has('category')
          ? getCellStringValue(row.getCell(colIndexMap.get('category')!))
          : ''
        const unit = colIndexMap.has('unit')
          ? getCellStringValue(row.getCell(colIndexMap.get('unit')!))
          : 'pcs'
        const quantity = colIndexMap.has('quantity')
          ? parseQuantity(row.getCell(colIndexMap.get('quantity')!))
          : null
        const batchNumber = colIndexMap.has('batchNumber')
          ? getCellStringValue(row.getCell(colIndexMap.get('batchNumber')!))
          : ''
        const serialNumber = colIndexMap.has('serialNumber')
          ? getCellStringValue(row.getCell(colIndexMap.get('serialNumber')!))
          : ''
        const remarks = colIndexMap.has('remarks')
          ? getCellStringValue(row.getCell(colIndexMap.get('remarks')!))
          : ''
        const warehouse = colIndexMap.has('warehouse')
          ? getCellStringValue(row.getCell(colIndexMap.get('warehouse')!))
          : ''
        const supplierName = colIndexMap.has('supplier')
          ? getCellStringValue(row.getCell(colIndexMap.get('supplier')!))
          : ''
        const unitCost = colIndexMap.has('unitCost')
          ? parseQuantity(row.getCell(colIndexMap.get('unitCost')!))
          : 0
        const expiryDateStr = colIndexMap.has('expiryDate')
          ? getCellStringValue(row.getCell(colIndexMap.get('expiryDate')!))
          : ''
        const storageLocation = colIndexMap.has('storageLocation')
          ? getCellStringValue(row.getCell(colIndexMap.get('storageLocation')!))
          : ''
        const invoiceNumber = colIndexMap.has('invoiceNumber')
          ? getCellStringValue(row.getCell(colIndexMap.get('invoiceNumber')!))
          : ''

        if (!quantity || quantity <= 0) {
          results.errors.push(`Row ${rowIndex} (${name}): Invalid or missing quantity`)
          results.skipped++
          results.errorCount++
          continue
        }

        // Auto-create category
        let categoryId: string | null = null
        if (categoryName) {
          let category = await db.category.findFirst({
            where: { name: categoryName },
          })
          if (!category) {
            const code = 'CAT-' + categoryName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
            let uniqueCode = code
            let codeExists = await db.category.findUnique({ where: { code: uniqueCode } })
            let attempt = 0
            while (codeExists && attempt < 10) {
              attempt++
              uniqueCode = `${code}-${attempt}`
              codeExists = await db.category.findUnique({ where: { code: uniqueCode } })
            }
            category = await db.category.create({
              data: { name: categoryName, code: uniqueCode, status: 'ACTIVE' },
            })
          }
          categoryId = category.id
        }

        // Auto-create supplier
        let supplierId: string | null = null
        if (supplierName) {
          let supplier = await db.supplier.findFirst({
            where: { name: supplierName },
          })
          if (!supplier) {
            const code = 'SUP-' + supplierName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
            let uniqueCode = code
            let codeExists = await db.supplier.findUnique({ where: { code: uniqueCode } })
            let attempt = 0
            while (codeExists && attempt < 10) {
              attempt++
              uniqueCode = `${code}-${attempt}`
              codeExists = await db.supplier.findUnique({ where: { code: uniqueCode } })
            }
            supplier = await db.supplier.create({
              data: { name: supplierName, code: uniqueCode, status: 'ACTIVE' },
            })
          }
          supplierId = supplier.id
        }

        // Auto-create or find product
        const sku = specification
          ? specification.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 20)
          : `SKU-${name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)}`
        const code = `PRD-${Date.now().toString(36).toUpperCase()}`

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
              modelNumber: specification || null,
              status: 'ACTIVE',
            },
            select: { id: true, name: true },
          })
        }

        // Check for existing opening stock (same product + warehouse)
        const existingStock = await db.openingStock.findFirst({
          where: {
            productId: product.id,
            warehouse: warehouse || null,
            status: { not: 'DELETED' },
          },
        })

        if (existingStock) {
          // Update existing entry
          await db.openingStock.update({
            where: { id: existingStock.id },
            data: {
              quantity: existingStock.quantity + quantity,
              unitCost: unitCost || existingStock.unitCost,
              inventoryValue: (unitCost || existingStock.unitCost) * (existingStock.quantity + quantity),
              currentStock: existingStock.currentStock + quantity,
              availableStock: existingStock.availableStock + quantity,
              lastTransactionAt: new Date(),
              importBatchId: importBatch.id,
            },
          })

          // Ledger entry for addition
          await db.stockLedger.create({
            data: {
              openingStockId: existingStock.id,
              transactionType: 'GOODS_RECEIVED',
              quantity,
              oldStock: existingStock.currentStock,
              newStock: existingStock.currentStock + quantity,
              userId: session.user.id,
              warehouse: warehouse || null,
              remarks: `Import add-on: ${remarks}`,
            },
          })

          results.updated++
          results.warningCount++
          results.warnings.push(`Row ${rowIndex} (${name}): Added to existing stock`)
        } else {
          // Create new opening stock
          const openingStock = await db.$transaction(async (tx) => {
            const stock = await tx.openingStock.create({
              data: {
                productId: product.id,
                warehouse: warehouse || null,
                storageLocation: storageLocation || null,
                quantity,
                unitCost: unitCost || 0,
                inventoryValue: (unitCost || 0) * quantity,
                batchNumber: batchNumber || null,
                serialNumber: serialNumber || null,
                expiryDate: expiryDateStr ? new Date(expiryDateStr) : null,
                supplierId: supplierId || null,
                invoiceNumber: invoiceNumber || null,
                remarks: remarks || null,
                openingDate: new Date(),
                createdById: session.user.id,
                importBatchId: importBatch.id,
                currentStock: quantity,
                availableStock: quantity,
                lastTransactionAt: new Date(),
                status: 'ACTIVE',
              },
            })

            // Ledger entry
            await tx.stockLedger.create({
              data: {
                openingStockId: stock.id,
                transactionType: 'OPENING',
                quantity,
                oldStock: 0,
                newStock: quantity,
                userId: session.user.id,
                warehouse: warehouse || null,
                remarks: remarks || 'Imported opening stock',
              },
            })

            return stock
          })

          // Process project field quantities from extra columns
          for (const [colName, colIdx] of Object.entries(extraCols)) {
            if (typeof colIdx !== 'number') continue

            const pfId = resolvedProjectFields.get(colName)
            if (!pfId) continue

            const cellValue = row.getCell(colIdx).value
            const pfQty = parseQuantity({ value: cellValue } as ExcelJS.Cell)

            if (pfQty && pfQty > 0) {
              await db.productProjectQty.upsert({
                where: {
                  productId_projectFieldId: {
                    productId: product.id,
                    projectFieldId: pfId,
                  },
                },
                create: {
                  productId: product.id,
                  projectFieldId: pfId,
                  requiredQty: pfQty,
                },
                update: {
                  requiredQty: pfQty,
                },
              })
            }
          }

          results.imported++
        }
      } catch (rowError) {
        console.error(`Error processing row ${rowIndex} (${name}):`, rowError)
        results.errors.push(
          `Row ${rowIndex} (${name}): ${rowError instanceof Error ? rowError.message : 'Unknown error'}`
        )
        results.skipped++
        results.errorCount++
      }
    }

    const durationMs = Date.now() - startTime

    // Update import batch
    await db.importBatch.update({
      where: { id: importBatch.id },
      data: {
        imported: results.imported,
        updated: results.updated,
        skipped: results.skipped,
        errorCount: results.errorCount,
        warningCount: results.warningCount,
        durationMs,
        status: results.errorCount > results.imported ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
        errorReport: results.errors.length > 0 ? JSON.stringify(results.errors.slice(0, 100)) : null,
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'OPENING_STOCK_IMPORTED',
        entityType: 'ImportBatch',
        entityId: importBatch.id,
        details: `Imported ${fileName}: ${results.imported} new, ${results.updated} updated, ${results.skipped} skipped, ${durationMs}ms`,
      },
    })

    return Response.json({
      success: true,
      importBatchId: importBatch.id,
      message: `Import complete: ${results.imported} imported, ${results.updated} updated, ${results.skipped} skipped`,
      ...results,
      durationMs,
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/opening-stock/import/execute error:', error)
    return Response.json({ error: 'Failed to execute import' }, { status: 500 })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCellStringValue(cell: ExcelJS.Cell): string {
  const val = cell.value
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return String(val)
  if (val instanceof Date) return val.toISOString().split('T')[0]
  if (typeof val === 'object' && 'richText' in val && Array.isArray(val.richText)) {
    return (val.richText as Array<{ text: string }>).map((r) => r.text).join('').trim()
  }
  if (typeof val === 'object' && 'formula' in val) {
    const formulaVal = (val as { result?: unknown }).result
    return formulaVal !== null && formulaVal !== undefined ? String(formulaVal).trim() : ''
  }
  if (typeof val === 'object' && 'text' in val) {
    return String((val as { text: string }).text).trim()
  }
  return String(val).trim()
}

function parseQuantity(cell: ExcelJS.Cell): number | null {
  const raw = cell.value
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return raw
  const str = String(raw).trim().replace(/,/g, '')
  if (!str) return null
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

function generateCodeFromName(name: string): string {
  const words = name.split(/[\s\-_/]+/).filter(Boolean)
  if (words.length === 0) return name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

  let code = ''
  if (words.length >= 2) {
    code = words[0].slice(0, 2).toUpperCase()
    for (let i = 1; i < words.length && code.length < 6; i++) {
      code += words[i].slice(0, 1).toUpperCase()
    }
  } else {
    code = words[0].toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  }

  return code || name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

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
