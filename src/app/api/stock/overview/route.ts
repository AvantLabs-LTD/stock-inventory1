import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse } from '@/lib/auth-middleware'

// GET /api/stock/overview — Overall inventory stats for dashboard
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    // Total active products
    const totalProducts = await db.product.count({
      where: { status: 'ACTIVE' },
    })

    // All transactions for active products
    const transactions = await db.inventoryTransaction.findMany({
      where: {
        product: { status: 'ACTIVE' },
      },
      include: {
        product: { select: { id: true, minimumStock: true } },
      },
    })

    // Per-product aggregation
    const productStats = new Map<string, {
      opening: number
      received: number
      issued: number
      returned: number
      adjustmentIn: number
      adjustmentOut: number
      minimumStock: number
    }>()

    for (const tx of transactions) {
      const pid = tx.productId
      if (!productStats.has(pid)) {
        productStats.set(pid, {
          opening: 0,
          received: 0,
          issued: 0,
          returned: 0,
          adjustmentIn: 0,
          adjustmentOut: 0,
          minimumStock: tx.product.minimumStock,
        })
      }
      const stats = productStats.get(pid)!
      switch (tx.type) {
        case 'OPENING_STOCK':
          stats.opening += tx.quantity
          break
        case 'GOODS_RECEIVED':
          stats.received += tx.quantity
          break
        case 'ISSUED':
          stats.issued += tx.quantity
          break
        case 'RETURNED':
          stats.returned += tx.quantity
          break
        case 'ADJUSTMENT_IN':
          stats.adjustmentIn += tx.quantity
          break
        case 'ADJUSTMENT_OUT':
          stats.adjustmentOut += tx.quantity
          break
      }
    }

    // Reserved per product
    const reservedData = await db.reservedInventory.groupBy({
      by: ['productId'],
      where: { status: 'ACTIVE' },
      _sum: { quantity: true },
    })

    const reservedMap = new Map<string, number>()
    for (const r of reservedData) {
      reservedMap.set(r.productId, r._sum.quantity || 0)
    }

    let totalStock = 0
    let totalAvailable = 0
    let totalReserved = 0
    let totalIssued = 0
    let lowStockItems: { productId: string; available: number; minimumStock: number }[] = []
    let outOfStockItems: { productId: string }[] = []

    // Also include products with no transactions (stock = 0)
    const activeProducts = await db.product.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, minimumStock: true },
    })

    for (const p of activeProducts) {
      const stats = productStats.get(p.id) || {
        opening: 0,
        received: 0,
        issued: 0,
        returned: 0,
        adjustmentIn: 0,
        adjustmentOut: 0,
        minimumStock: p.minimumStock,
      }
      const reserved = reservedMap.get(p.id) || 0
      const available =
        stats.opening + stats.received + stats.returned + stats.adjustmentIn -
        stats.issued - stats.adjustmentOut - reserved

      const totalForProduct = stats.opening + stats.received + stats.returned + stats.adjustmentIn

      totalStock += totalForProduct
      totalAvailable += Math.max(0, available)
      totalReserved += reserved
      totalIssued += stats.issued + stats.adjustmentOut

      if (available <= 0) {
        outOfStockItems.push({ productId: p.id })
      } else if (available <= stats.minimumStock) {
        lowStockItems.push({ productId: p.id, available, minimumStock: stats.minimumStock })
      }
    }

    // Today's stats
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [todayReceived, todayIssued] = await Promise.all([
      db.goodsReceived.count({
        where: { date: { gte: todayStart } },
      }),
      db.inventoryIssue.count({
        where: { date: { gte: todayStart } },
      }),
    ])

    return Response.json({
      totalProducts,
      totalStock,
      totalAvailable,
      totalReserved,
      totalIssued,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
      lowStockItems: lowStockItems.slice(0, 10),
      outOfStockItems: outOfStockItems.slice(0, 10),
      todayReceived,
      todayIssued,
    })
  } catch (error) {
    console.error('GET /api/stock/overview error:', error)
    return Response.json({ error: 'Failed to fetch stock overview' }, { status: 500 })
  }
}
