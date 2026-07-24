import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/reports/goods-received?supplierId=xxx&dateFrom=xxx&dateTo=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reports', 'view')) {
      return forbiddenResponse('No permission to view reports')
    }

    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const filter: Record<string, unknown> = {}
    if (supplierId) filter.supplierId = supplierId
    if (dateFrom || dateTo) {
      filter.date = {}
      if (dateFrom) (filter.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (filter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    const records = await db.goodsReceived.findMany({
      where: Object.keys(filter).length > 0 ? filter : undefined,
      orderBy: { date: 'desc' },
      include: {
        product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
        supplier: { select: { id: true, name: true } },
        receivedByUser: { select: { id: true, name: true } },
      },
    })

    const data = records.map((r) => ({
      id: r.id,
      date: r.date,
      productId: r.productId,
      product: r.product,
      supplierId: r.supplierId,
      supplier: r.supplier,
      source: r.source,
      purchaseReference: r.purchaseReference,
      invoiceNumber: r.invoiceNumber,
      quantity: r.quantity,
      unitCost: r.unitCost,
      totalCost: r.quantity * r.unitCost,
      receivedBy: r.receivedBy,
      receivedByUser: r.receivedByUser,
      remarks: r.remarks,
    }))

    const totalQuantity = data.reduce((s, d) => s + d.quantity, 0)
    const totalValue = data.reduce((s, d) => s + d.totalCost, 0)

    return Response.json({
      data,
      summary: {
        totalRecords: data.length,
        totalQuantity,
        totalValue,
      },
    })
  } catch (error) {
    console.error('GET /api/reports/goods-received error:', error)
    return Response.json({ error: 'Failed to generate goods received report' }, { status: 500 })
  }
}
