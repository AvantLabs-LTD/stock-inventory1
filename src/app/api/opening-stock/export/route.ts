import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── GET /api/opening-stock/export — Export to Excel with dynamic project columns ──
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to export opening stock')
    }

    const { searchParams } = new URL(request.url)
    const warehouse = searchParams.get('warehouse') || ''
    const categoryId = searchParams.get('categoryId') || ''
    const status = searchParams.get('status') || 'ACTIVE'
    const stockStatus = searchParams.get('stockStatus') || ''

    // Build where
    const where: Record<string, unknown> = { status }

    if (warehouse) where.warehouse = warehouse
    if (categoryId) {
      where.product = { categoryId }
    }

    // Fetch entries
    const entries = await db.openingStock.findMany({
      where,
      orderBy: { openingDate: 'asc' },
      include: {
        product: {
          select: {
            id: true, name: true, code: true, sku: true, unit: true,
            barcode: true, brand: true, size: true, length: true, color: true,
            minimumStock: true, maximumStock: true, reorderLevel: true,
            variantName: true, parentProductId: true,
            category: { select: { id: true, name: true, code: true } },
            supplier: { select: { id: true, name: true } },
            parent: { select: { id: true, name: true, code: true } },
          },
        },
        supplier: { select: { id: true, name: true } },
        projectQtys: {
          include: {
            projectField: { select: { id: true, name: true, code: true } },
          },
        },
      },
    })

    if (entries.length === 0) {
      return Response.json({ error: 'No data to export' }, { status: 404 })
    }

    // Get project fields
    const projectFields = await db.projectField.findMany({
      orderBy: { name: 'asc' },
    })

    // Build Excel
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'InventoryPro'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Stock')

    // Columns
    const baseColumns = [
      { header: 'Sr/No', key: 'srNo', width: 8 },
      { header: 'Item Name', key: 'name', width: 28 },
      { header: 'Specification', key: 'specs', width: 22 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Unit', key: 'unit', width: 8 },
      { header: 'Opening Qty', key: 'openingQty', width: 14 },
      { header: 'Unit Cost', key: 'unitCost', width: 12 },
      { header: 'Inventory Value', key: 'inventoryValue', width: 16 },
      { header: 'Current Stock', key: 'currentStock', width: 14 },
      { header: 'Available', key: 'available', width: 12 },
      { header: 'Received', key: 'received', width: 12 },
      { header: 'Issued', key: 'issued', width: 12 },
      { header: 'Returned', key: 'returned', width: 12 },
      { header: 'Reserved', key: 'reserved', width: 12 },
      { header: 'Damaged', key: 'damaged', width: 12 },
      { header: 'Min Stock', key: 'minStock', width: 12 },
      { header: 'Reorder Level', key: 'reorderLevel', width: 14 },
      { header: 'Stock Status', key: 'stockStatus', width: 14 },
      { header: 'Warehouse', key: 'warehouse', width: 14 },
      { header: 'Batch Number', key: 'batchNumber', width: 16 },
      { header: 'Serial Number', key: 'serialNumber', width: 16 },
      { header: 'Supplier', key: 'supplier', width: 18 },
      { header: 'Opening Date', key: 'openingDate', width: 14 },
      { header: 'Remarks', key: 'remarks', width: 30 },
    ]

    // Add project field columns dynamically
    const projectColumns = projectFields.map((pf) => ({
      header: pf.code || pf.name,
      key: `pf_${pf.id}`,
      width: 14,
    }))

    sheet.columns = [...baseColumns, ...projectColumns]

    // Style header
    const headerRow = sheet.getRow(1)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF374151' },
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' },
      }
    })
    headerRow.height = 28
    sheet.views = [{ state: 'frozen', ySplit: 1 }]

    // Data rows
    let srNo = 1
    for (const entry of entries) {
      const p = entry.product
      const computedStatus = computeStockStatus(
        entry.currentStock,
        p.minimumStock,
        p.reorderLevel
      )

      // Build project field quantities map
      const pfMap: Record<string, number> = {}
      for (const pq of entry.projectQtys) {
        pfMap[pq.projectFieldId] = pq.requiredQty
      }

      const rowData: Record<string, unknown> = {
        srNo,
        name: p.parent ? `${p.parent.name} - ${p.variantName || p.name}` : p.name,
        specs: p.modelNumber || p.sku !== p.code ? p.sku : '',
        category: p.category?.name || '',
        unit: p.unit || 'pcs',
        openingQty: entry.quantity,
        unitCost: entry.unitCost,
        inventoryValue: entry.inventoryValue,
        currentStock: entry.currentStock,
        available: entry.availableStock,
        received: entry.receivedQty,
        issued: entry.issuedQty,
        returned: entry.returnedQty,
        reserved: entry.reservedQty,
        damaged: entry.damagedQty,
        minStock: p.minimumStock,
        reorderLevel: p.reorderLevel,
        stockStatus: computedStatus,
        warehouse: entry.warehouse || '',
        batchNumber: entry.batchNumber || '',
        serialNumber: entry.serialNumber || '',
        supplier: entry.supplier?.name || '',
        openingDate: entry.openingDate.toISOString().split('T')[0],
        remarks: entry.remarks || '',
      }

      // Add project field values
      for (const pf of projectFields) {
        rowData[`pf_${pf.id}`] = pfMap[pf.id] || 0
      }

      const row = sheet.addRow(rowData)

      // Format
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        }
        cell.alignment = { vertical: 'middle' }
      })

      // Color-code stock status
      const statusCell = row.getCell('stockStatus')
      if (statusCell.value === 'OUT_OF_STOCK') {
        statusCell.font = { color: { argb: 'FFDC2626' }, bold: true }
      } else if (statusCell.value === 'CRITICAL') {
        statusCell.font = { color: { argb: 'FFF97316' }, bold: true }
      } else if (statusCell.value === 'LOW') {
        statusCell.font = { color: { argb: 'FFD97706' } }
      } else {
        statusCell.font = { color: { argb: 'FF16A34A' } }
      }

      srNo++
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `Stock Export - ${dateStr}.xlsx`

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    })
  } catch (error) {
    console.error('GET /api/opening-stock/export error:', error)
    return Response.json({ error: 'Failed to export' }, { status: 500 })
  }
}

function computeStockStatus(currentStock: number, minimumStock: number, reorderLevel: number): string {
  if (currentStock <= 0) return 'OUT_OF_STOCK'
  if (currentStock <= minimumStock) return 'CRITICAL'
  if (currentStock <= reorderLevel) return 'LOW'
  return 'HEALTHY'
}
