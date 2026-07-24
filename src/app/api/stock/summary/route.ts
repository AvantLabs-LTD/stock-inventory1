import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/stock/summary?productId=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view stock summary')
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')

    if (!productId) {
      return Response.json({ error: 'productId is required' }, { status: 400 })
    }

    // Verify product
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, code: true, unit: true, minimumStock: true },
    })
    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    // Calculate stock from transactions
    const transactions = await db.inventoryTransaction.findMany({
      where: { productId },
      orderBy: { date: 'desc' },
    })

    let openingStock = 0
    let totalReceived = 0
    let totalIssued = 0
    let totalReturned = 0
    let totalAdjustmentIn = 0
    let totalAdjustmentOut = 0

    for (const tx of transactions) {
      switch (tx.type) {
        case 'OPENING_STOCK':
          openingStock += tx.quantity
          break
        case 'GOODS_RECEIVED':
          totalReceived += tx.quantity
          break
        case 'ISSUED':
          totalIssued += tx.quantity
          break
        case 'RETURNED':
          totalReturned += tx.quantity
          break
        case 'ADJUSTMENT_IN':
          totalAdjustmentIn += tx.quantity
          break
        case 'ADJUSTMENT_OUT':
          totalAdjustmentOut += tx.quantity
          break
      }
    }

    // Reserved stock
    const reservedResult = await db.reservedInventory.aggregate({
      where: { productId, status: 'ACTIVE' },
      _sum: { quantity: true },
    })
    const reservedStock = reservedResult._sum.quantity || 0

    // Available = (Opening + Received + Returned + AdjustmentIn) - Issued - AdjustmentOut - Reserved
    const available =
      openingStock + totalReceived + totalReturned + totalAdjustmentIn -
      totalIssued - totalAdjustmentOut - reservedStock

    // Recent transactions (last 10)
    const recentTransactions = await db.inventoryTransaction.findMany({
      where: { productId },
      orderBy: { date: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        quantity: true,
        unitCost: true,
        reference: true,
        remarks: true,
        date: true,
      },
    })

    return Response.json({
      product,
      summary: {
        openingStock,
        totalReceived,
        totalIssued,
        totalReturned,
        totalAdjustmentIn,
        totalAdjustmentOut,
        reservedStock,
        available,
      },
      recentTransactions,
    })
  } catch (error) {
    console.error('GET /api/stock/summary error:', error)
    return Response.json({ error: 'Failed to fetch stock summary' }, { status: 500 })
  }
}
