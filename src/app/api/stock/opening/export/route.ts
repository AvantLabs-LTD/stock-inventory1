import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view opening stock data')
    }

    // Fetch ALL opening stock entries with product details
    const entries = await db.inventoryTransaction.findMany({
      where: { type: 'OPENING_STOCK' },
      orderBy: { createdAt: 'asc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            code: true,
            sku: true,
            unit: true,
            category: { select: { name: true } },
            supplier: { select: { name: true } },
            minimumStock: true,
            status: true,
          },
        },
      },
    })

    if (entries.length === 0) {
      return Response.json(
        { error: 'No opening stock data available to export. Set opening stock for products first.' },
        { status: 404 },
      )
    }

    // Fetch aggregated data for all products
    const productIds = entries.map((e) => e.productId)

    // Reserved quantities (allocated)
    const reservations = await db.reservedInventory.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, status: 'ACTIVE' },
      _sum: { quantity: true },
    })
    const reservedMap = new Map(reservations.map((r) => [r.productId, r._sum.quantity || 0]))

    // Pending requests (approved but not completed = ordered/not yet received)
    const pendingRequests = await db.inventoryRequest.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        status: { in: ['APPROVED', 'PARTIALLY_COMPLETED'] },
      },
      _sum: { quantity: true },
    })
    const orderedMap = new Map(
      pendingRequests.map((r) => [r.productId, r._sum.quantity || 0]),
    )

    // All transactions for calculating stock totals
    const allTransactions = await db.inventoryTransaction.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, type: true, quantity: true },
    })
    const txMap = new Map<string, {
      opening: number; received: number; issued: number;
      returned: number; adjIn: number; adjOut: number;
    }>()
    for (const pid of productIds) {
      txMap.set(pid, { opening: 0, received: 0, issued: 0, returned: 0, adjIn: 0, adjOut: 0 })
    }
    for (const tx of allTransactions) {
      const e = txMap.get(tx.productId)
      if (!e) continue
      switch (tx.type) {
        case 'OPENING_STOCK': e.opening += tx.quantity; break
        case 'GOODS_RECEIVED': e.received += tx.quantity; break
        case 'ISSUED': e.issued += tx.quantity; break
        case 'RETURNED': e.returned += tx.quantity; break
        case 'ADJUSTMENT_IN': e.adjIn += tx.quantity; break
        case 'ADJUSTMENT_OUT': e.adjOut += tx.quantity; break
      }
    }

    // Batch count per product (number of opening stock entries)
    const batchCountMap = new Map<string, number>()
    for (const entry of entries) {
      batchCountMap.set(entry.productId, (batchCountMap.get(entry.productId) || 0) + 1)
    }

    // ─── Build Excel workbook ───────────────────────────────────────
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'InventoryPro'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Electronic Connectors')

    // Column definitions with widths
    sheet.columns = [
      { header: 'Sr/No', key: 'srNo', width: 8 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Specs', key: 'specs', width: 22 },
      { header: 'A/U', key: 'unit', width: 8 },
      { header: 'Quantity in Total Stock', key: 'totalStock', width: 24 },
      { header: 'To Be Used', key: 'toBeUsed', width: 16 },
      { header: 'Total Batch', key: 'totalBatch', width: 14 },
      { header: 'Required', key: 'required', width: 14 },
      { header: 'Ordered', key: 'ordered', width: 14 },
      { header: 'Remarks', key: 'remarks', width: 30 },
    ]

    // Style header row: bold white on dark grey, centered, thin border
    const headerRow = sheet.getRow(1)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: 'FF374151' },
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' },
      }
    })
    headerRow.height = 28

    // Freeze top row + enable auto-filter
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = { from: 'A1', to: 'J1' }

    // Populate data rows
    let srNo = 1
    for (const entry of entries) {
      const p = entry.product
      const tx = txMap.get(p.id)!
      const reserved = reservedMap.get(p.id) || 0
      const ordered = orderedMap.get(p.id) || 0
      const batchCount = batchCountMap.get(p.id) || 1

      // Available stock: opening + received + returned + adjIn - issued - adjOut - reserved
      const totalStock =
        tx.opening + tx.received + tx.returned + tx.adjIn - tx.issued - tx.adjOut - reserved

      // To Be Used = issued + reserved (allocated for production/orders)
      const toBeUsed = tx.issued + reserved

      // Required = totalStock - toBeUsed (remaining needed; negative = deficit)
      const required = totalStock - toBeUsed

      const row = sheet.addRow({
        srNo,
        name: p.name,
        specs: p.sku !== p.code ? p.sku : '',
        unit: p.unit || 'pcs',
        totalStock,
        toBeUsed,
        totalBatch: batchCount,
        required,
        ordered,
        remarks: entry.remarks ?? '',
      })

      // Cell formatting
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        }
        cell.alignment = { vertical: 'middle' }
        // Center-align Sr/No, Unit columns
        if (colNumber <= 2 || colNumber === 4) cell.alignment.horizontal = 'center'
        // Right-align numeric columns
        if (colNumber >= 5 && colNumber <= 9) cell.alignment.horizontal = 'right'
      })

      // Highlight negative Required in red
      const reqCell = row.getCell('required')
      if (typeof reqCell.value === 'number' && reqCell.value < 0) {
        reqCell.font = { color: { argb: 'FFDC2626' }, bold: true }
      }

      srNo++
    }

    // ─── Generate buffer ────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer()
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `Opening Stock - Electronic Connectors_${dateStr}.xlsx`

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    })
  } catch (error) {
    console.error('Opening Stock export error:', error)
    return Response.json(
      { error: 'Failed to generate Excel export. Please try again.' },
      { status: 500 },
    )
  }
}
