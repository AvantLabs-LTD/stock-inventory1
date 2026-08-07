import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/inventory-items/export — Export inventory data as Excel
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view inventory items')
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const itemName = searchParams.get('itemName') || ''
    const warehouse = searchParams.get('warehouse') || ''
    const stockFilter = searchParams.get('stockFilter') || 'all'

    // Build where clause
    const where: Record<string, unknown> = { status: 'ACTIVE' }

    if (search) {
      where.OR = [
        { itemName: { contains: search } },
        { specification: { contains: search } },
      ]
    }

    if (itemName) {
      where.itemName = itemName
    }

    if (warehouse) {
      where.warehouse = warehouse
    }

    if (stockFilter === 'lowStock') {
      where.minimumStock = { gt: 0 }
      where.quantity = { gt: 0 }
    } else if (stockFilter === 'outOfStock') {
      where.quantity = 0
    } else if (stockFilter === 'reserved') {
      where.reservedQty = { gt: 0 }
    }

    const items = await db.inventoryItem.findMany({
      where,
      orderBy: [{ itemName: 'asc' }, { specification: 'asc' }],
    })

    // Post-filter for lowStock (needs arithmetic comparison)
    const filteredItems = items.filter((item) => {
      if (stockFilter === 'lowStock') {
        return item.minimumStock > 0 && item.quantity > 0 && item.quantity <= item.minimumStock
      }
      return true
    })

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Inventory Items')

    // Add header row
    sheet.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Item Name', key: 'itemName', width: 30 },
      { header: 'Specification', key: 'specification', width: 25 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Inventory', key: 'quantity', width: 12 },
      { header: 'Issued', key: 'issuedQty', width: 10 },
      { header: 'Available Stock', key: 'availableStock', width: 16 },
      { header: 'Reserved Stock', key: 'reservedQty', width: 16 },
      { header: 'Min Stock', key: 'minimumStock', width: 12 },
      { header: 'Warehouse', key: 'warehouse', width: 20 },
    ]

    // Style header row
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, size: 11 }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E7EF' },
    }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 22

    // Add data rows
    filteredItems.forEach((item, index) => {
      const availableStock = Math.max(0, item.quantity - item.issuedQty - item.reservedQty)
      sheet.addRow({
        sno: index + 1,
        itemName: item.itemName,
        specification: item.specification,
        unit: item.unit,
        quantity: item.quantity,
        issuedQty: item.issuedQty,
        availableStock,
        reservedQty: item.reservedQty,
        minimumStock: item.minimumStock,
        warehouse: item.warehouse,
      })
    })

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

    const filename = `inventory-items-${new Date().toISOString().slice(0, 10)}.xlsx`

    return new Response(buffer as BlobPart, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('GET /api/inventory-items/export error:', error)
    return Response.json({ error: 'Failed to export inventory items' }, { status: 500 })
  }
}
