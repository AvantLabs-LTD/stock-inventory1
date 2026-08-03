import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// POST /api/stock/opening/import — Import opening stock from Excel
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
      return Response.json({ error: 'No file uploaded. Please provide an Excel file.' }, { status: 400 })
    }

    if (!file.name.endsWith('.xlsx')) {
      return Response.json({ error: 'Only .xlsx files are supported' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const sheet = workbook.worksheets[0]
    if (!sheet || sheet.rowCount < 2) {
      return Response.json({ error: 'Excel file is empty or has no data rows' }, { status: 400 })
    }

    // Expected columns: Name, Specification, Category, Unit, Quantity, Remarks
    // Read header row to find column indices
    const headerRow = sheet.getRow(1)
    const headerMap = new Map<string, number>()
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = String(cell.value || '').trim().toLowerCase()
      if (header.includes('name')) headerMap.set('name', colNumber)
      else if (header.includes('spec') || header.includes('sku')) headerMap.set('specification', colNumber)
      else if (header.includes('categ')) headerMap.set('category', colNumber)
      else if (header.includes('unit') || header.includes('a/u')) headerMap.set('unit', colNumber)
      else if (header.includes('qty') || header.includes('quantity')) headerMap.set('quantity', colNumber)
      else if (header.includes('remark') || header.includes('note')) headerMap.set('remarks', colNumber)
    })

    if (!headerMap.has('name')) {
      return Response.json({ error: 'Missing required column: Name' }, { status: 400 })
    }
    if (!headerMap.has('quantity')) {
      return Response.json({ error: 'Missing required column: Quantity' }, { status: 400 })
    }

    const nameCol = headerMap.get('name')!
    const specCol = headerMap.get('specification')
    const catCol = headerMap.get('category')
    const unitCol = headerMap.get('unit')
    const qtyCol = headerMap.get('quantity')!
    const remarksCol = headerMap.get('remarks')

    const results = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    }

    // Process each data row
    for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) {
      const row = sheet.getRow(rowIndex)

      const name = String(row.getCell(nameCol).value || '').trim()
      const specification = specCol ? String(row.getCell(specCol).value || '').trim() : ''
      const categoryName = catCol ? String(row.getCell(catCol).value || '').trim() : ''
      const unit = unitCol ? String(row.getCell(unitCol).value || '').trim() : 'pcs'
      const rawQty = row.getCell(qtyCol).value
      const remarks = remarksCol ? String(row.getCell(remarksCol).value || '').trim() : ''

      // Skip empty rows
      if (!name && !specification) continue
      if (!name) {
        results.errors.push(`Row ${rowIndex}: Missing product name`)
        results.skipped++
        continue
      }

      // Parse quantity (handle numbers stored as text)
      const quantity = typeof rawQty === 'number' ? rawQty : parseInt(String(rawQty || '0'), 10)
      if (!quantity || quantity <= 0) {
        results.errors.push(`Row ${rowIndex} (${name}): Invalid or zero quantity`)
        results.skipped++
        continue
      }

      try {
        // Auto-create category if needed
        let categoryId: string | null = null
        if (categoryName) {
          let category = await db.category.findUnique({ where: { name: categoryName } })
          if (!category) {
            // Generate a code from category name
            const code = 'CAT-' + categoryName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
            category = await db.category.create({
              data: { name: categoryName, code, status: 'ACTIVE' },
            })
          }
          categoryId = category.id
        }

        // Generate SKU from specification
        const sku = specification
          ? specification.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 20)
          : `SKU-${name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)}`

        // Generate a unique code
        const code = `P-${name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)}-${Date.now()}`

        // Auto-create or find product
        let product = await db.product.findFirst({
          where: {
            OR: [
              { name, sku },
              { name, code },
            ],
          },
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
              status: 'ACTIVE',
            },
            select: { id: true, name: true },
          })
        }

        // Check for existing opening stock
        const existingOpening = await db.inventoryTransaction.findFirst({
          where: { productId: product.id, type: 'OPENING_STOCK' },
        })

        if (existingOpening) {
          // Update existing
          await db.inventoryTransaction.update({
            where: { id: existingOpening.id },
            data: { quantity, remarks: remarks || existingOpening.remarks || 'Opening stock entry (imported)' },
          })
          results.updated++
        } else {
          // Create new
          await db.inventoryTransaction.create({
            data: {
              productId: product.id,
              type: 'OPENING_STOCK',
              quantity,
              remarks: remarks || 'Opening stock entry (imported)',
            },
          })
          results.imported++
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
        details: `Imported opening stock from ${file.name}: ${results.imported} new, ${results.updated} updated, ${results.skipped} skipped`,
      },
    })

    return Response.json({
      success: true,
      message: `Import complete: ${results.imported} imported, ${results.updated} updated, ${results.skipped} skipped`,
      ...results,
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/stock/opening/import error:', error)
    return Response.json({ error: 'Failed to import opening stock' }, { status: 500 })
  }
}
