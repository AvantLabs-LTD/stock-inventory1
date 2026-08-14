import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/inventory-items/export — Export inventory data as Excel (grouped)
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

    const where: Record<string, unknown> = { status: 'ACTIVE' }

    if (search) {
      where.OR = [
        { itemName: { contains: search } },
        { specification: { contains: search } },
      ]
    }
    if (itemName) where.itemName = itemName
    if (warehouse) where.warehouse = warehouse

    const items = await db.inventoryItem.findMany({
      where,
      orderBy: [{ itemName: 'asc' }, { specification: 'asc' }],
    })

    const filteredItems = items.filter((item) => {
      if (stockFilter === 'lowStock') {
        return item.minimumStock > 0 && item.quantity > 0 && item.quantity <= item.minimumStock
      }
      if (stockFilter === 'outOfStock') return item.quantity === 0
      if (stockFilter === 'reserved') return item.reservedQty > 0
      return true
    })

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Inventory Register')

    // Columns
    sheet.columns = [
      { header: 'S.No', key: 'sno', width: 6 },
      { header: 'Item Name', key: 'itemName', width: 28 },
      { header: 'Specification', key: 'specification', width: 22 },
      { header: 'Unit', key: 'unit', width: 8 },
      { header: 'Inventory', key: 'quantity', width: 11 },
      { header: 'Issued', key: 'issuedQty', width: 9 },
      { header: 'Available Stock', key: 'availableStock', width: 15 },
      { header: 'Reserved', key: 'reservedQty', width: 10 },
      { header: 'Min Stock', key: 'minimumStock', width: 11 },
      { header: 'Unit Cost', key: 'unitCost', width: 11 },
      { header: 'Warehouse', key: 'warehouse', width: 18 },
      { header: 'Last Updated', key: 'lastTransactionAt', width: 20 },
      { header: 'Remarks', key: 'remarks', width: 25 },
    ]

    // Style header
    const header = sheet.getRow(1)
    header.font = { bold: true, size: 11 }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7EF' } }
    header.alignment = { vertical: 'middle', horizontal: 'center' }
    header.height = 22

    let sno = 0
    for (const item of filteredItems) {
      sno++
      const available = Math.max(0, item.quantity - item.issuedQty - item.reservedQty)
      const row = sheet.addRow({
        sno,
        itemName: item.itemName,
        specification: item.specification,
        unit: item.unit,
        quantity: item.quantity,
        issuedQty: item.issuedQty || '',
        availableStock: available,
        reservedQty: item.reservedQty || '',
        minimumStock: item.minimumStock || '',
        unitCost: item.unitCost || '',
        warehouse: item.warehouse,
        lastTransactionAt: item.lastTransactionAt ? item.lastTransactionAt.toLocaleDateString('en-PK') : '',
        remarks: item.remarks || '',
      })

      // Alternate row shading
      if (sno % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `inventory-register-${new Date().toISOString().slice(0, 10)}.xlsx`

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
