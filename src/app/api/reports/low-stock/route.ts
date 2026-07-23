import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/reports/low-stock
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reports', 'view')) {
      return forbiddenResponse('No permission to view reports')
    }

    // Get all active products with minimum stock > 0
    const products = await db.product.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        code: true,
        name: true,
        sku: true,
        unit: true,
        minimumStock: true,
        unitCost: true,
        category: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    })

    const productIds = products.map((p) => p.id)

    // Batch fetch all transactions
    const transactions = await db.inventoryTransaction.findMany({
      where: productIds.length > 0 ? { productId: { in: productIds } } : undefined,
      select: { productId: true, type: true, quantity: true },
    })

    // Batch fetch active reservations
    const reservations = await db.reservedInventory.groupBy({
      by: ['productId'],
      where: { status: 'ACTIVE' },
      _sum: { quantity: true },
    })

    const reservedMap = new Map(reservations.map((r) => [r.productId, r._sum.quantity || 0]))

    // Build transaction aggregates
    const txMap = new Map<string, { opening: number; received: number; issued: number; returned: number; adjIn: number; adjOut: number }>()
    for (const p of products) {
      txMap.set(p.id, { opening: 0, received: 0, issued: 0, returned: 0, adjIn: 0, adjOut: 0 })
    }
    for (const tx of transactions) {
      const entry = txMap.get(tx.productId)
      if (!entry) continue
      switch (tx.type) {
        case 'OPENING_STOCK': entry.opening += tx.quantity; break
        case 'GOODS_RECEIVED': entry.received += tx.quantity; break
        case 'ISSUED': entry.issued += tx.quantity; break
        case 'RETURNED': entry.returned += tx.quantity; break
        case 'ADJUSTMENT_IN': entry.adjIn += tx.quantity; break
        case 'ADJUSTMENT_OUT': entry.adjOut += tx.quantity; break
      }
    }

    // Filter for low stock (available <= minimumStock) and sort by severity
    const data = products
      .map((p) => {
        const tx = txMap.get(p.id)!
        const reserved = reservedMap.get(p.id) || 0
        const available = tx.opening + tx.received + tx.returned + tx.adjIn - tx.issued - tx.adjOut - reserved
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          category: p.category?.name ?? null,
          supplier: p.supplier?.name ?? null,
          minimumStock: p.minimumStock,
          available,
          unitCost: p.unitCost,
          deficit: p.minimumStock - Math.max(0, available),
          isOutOfStock: available <= 0,
          totalValue: Math.max(0, available) * (p.unitCost || 0),
        }
      })
      .filter((d) => d.available <= d.minimumStock)
      .sort((a, b) => a.available - b.available) // Most critical first

    const outOfStockCount = data.filter((d) => d.isOutOfStock).length
    const totalDeficit = data.reduce((s, d) => s + Math.max(0, d.deficit), 0)
    const totalValueAtRisk = data.reduce((s, d) => s + d.totalValue, 0)

    return Response.json({
      data,
      summary: {
        totalLowStock: data.length,
        outOfStockCount,
        totalDeficit,
        totalValueAtRisk,
      },
    })
  } catch (error) {
    console.error('GET /api/reports/low-stock error:', error)
    return Response.json({ error: 'Failed to generate low stock report' }, { status: 500 })
  }
}
