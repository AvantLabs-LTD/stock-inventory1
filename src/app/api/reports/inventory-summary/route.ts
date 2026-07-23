import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/reports/inventory-summary?categoryId=xxx&status=xxx&departmentId=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reports', 'view')) {
      return forbiddenResponse('No permission to view reports')
    }

    const { searchParams } = new URL(request.url)
    const categoryId = searchParams.get('categoryId')
    const status = searchParams.get('status')
    const departmentId = searchParams.get('departmentId')

    const productFilter: Record<string, unknown> = {}
    if (categoryId) productFilter.categoryId = categoryId
    if (status) productFilter.status = status

    const products = await db.product.findMany({
      where: Object.keys(productFilter).length > 0 ? productFilter : undefined,
      select: {
        id: true,
        code: true,
        name: true,
        sku: true,
        unit: true,
        minimumStock: true,
        unitCost: true,
        status: true,
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    })

    const productIds = products.map((p) => p.id)

    // Batch fetch all transactions for these products
    const transactions = await db.inventoryTransaction.findMany({
      where: productIds.length > 0 ? { productId: { in: productIds } } : undefined,
      select: { productId: true, type: true, quantity: true },
    })

    // Batch fetch active reservations
    const reservations = await db.reservedInventory.groupBy({
      by: ['productId'],
      where: productIds.length > 0
        ? { productId: { in: productIds }, status: 'ACTIVE' }
        : { status: 'ACTIVE' },
      _sum: { quantity: true },
    })

    const reservedMap = new Map<string, number>()
    for (const r of reservations) {
      reservedMap.set(r.productId, r._sum.quantity || 0)
    }

    // If departmentId is specified, only show products that have been issued to that department
    let relevantProductIds = productIds
    if (departmentId) {
      const issuedProducts = await db.inventoryIssue.findMany({
        where: { departmentId },
        select: { productId: true },
        distinct: ['productId'],
      })
      const issuedSet = new Set(issuedProducts.map((ip) => ip.productId))
      relevantProductIds = productIds.filter((id) => issuedSet.has(id))
    }

    // Build transaction aggregates per product
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

    const data = products
      .filter((p) => !departmentId || relevantProductIds.includes(p.id))
      .map((p) => {
        const tx = txMap.get(p.id)!
        const reserved = reservedMap.get(p.id) || 0
        const available = tx.opening + tx.received + tx.returned + tx.adjIn - tx.issued - tx.adjOut - reserved
        const totalValue = Math.max(0, available) * (p.unitCost || 0)
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          category: p.category?.name ?? null,
          supplier: p.supplier?.name ?? null,
          status: p.status,
          opening: tx.opening,
          received: tx.received,
          issued: tx.issued,
          returned: tx.returned,
          reserved,
          available,
          unitCost: p.unitCost,
          totalValue,
          minimumStock: p.minimumStock,
          isLowStock: available <= p.minimumStock,
        }
      })

    // Summary stats
    const totalAvailable = data.reduce((sum, d) => sum + Math.max(0, d.available), 0)
    const totalValueAll = data.reduce((sum, d) => sum + d.totalValue, 0)
    const lowStockCount = data.filter((d) => d.isLowStock).length
    const outOfStockCount = data.filter((d) => d.available <= 0).length

    return Response.json({
      data,
      summary: {
        totalProducts: data.length,
        totalAvailable,
        totalValue: totalValueAll,
        lowStockCount,
        outOfStockCount,
      },
    })
  } catch (error) {
    console.error('GET /api/reports/inventory-summary error:', error)
    return Response.json({ error: 'Failed to generate inventory summary report' }, { status: 500 })
  }
}
