import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse } from '@/lib/auth-middleware'

// GET /api/inventory/history/product/[id] — Timeline with running balance
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    const { id } = await params

    // Validate product exists
    const product = await db.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        sku: true,
        code: true,
        unit: true,
        status: true,
        minimumStock: true,
      },
    })

    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    // Get all transactions for this product ordered by date ascending
    const transactions = await db.inventoryTransaction.findMany({
      where: { productId: id },
      orderBy: { date: 'asc' },
    })

    // Calculate running balance
    let runningBalance = 0
    const timeline = transactions.map((tx) => {
      switch (tx.type) {
        case 'OPENING_STOCK':
        case 'GOODS_RECEIVED':
        case 'RETURNED':
        case 'ADJUSTMENT_IN':
          runningBalance += tx.quantity
          break
        case 'ISSUED':
        case 'ADJUSTMENT_OUT':
          runningBalance -= tx.quantity
          break
      }
      return {
        ...tx,
        runningBalance,
      }
    })

    // Also calculate current reserved amount
    const reservedData = await db.reservedInventory.aggregate({
      where: { productId: id, status: 'ACTIVE' },
      _sum: { quantity: true },
    })

    const totalReserved = reservedData._sum.quantity || 0

    return Response.json({
      product,
      timeline,
      currentBalance: runningBalance,
      availableBalance: Math.max(0, runningBalance - totalReserved),
      totalReserved,
    })
  } catch (error) {
    console.error('GET /api/inventory/history/product/[id] error:', error)
    return Response.json({ error: 'Failed to fetch product history' }, { status: 500 })
  }
}
