import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/reports/inventory-ledger?productId=xxx&dateFrom=xxx&dateTo=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reports', 'view')) {
      return forbiddenResponse('No permission to view reports')
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const txFilter: Record<string, unknown> = {}
    if (productId) txFilter.productId = productId
    if (dateFrom || dateTo) {
      txFilter.date = {}
      if (dateFrom) (txFilter.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (txFilter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    const transactions = await db.inventoryTransaction.findMany({
      where: Object.keys(txFilter).length > 0 ? txFilter : undefined,
      orderBy: [{ productId: 'asc' }, { date: 'asc' }, { createdAt: 'asc' }],
      include: {
        product: {
          select: { id: true, name: true, code: true, sku: true, unit: true },
        },
      },
    })

    // Group by product and calculate running balance
    const productGroups = new Map<string, {
      product: typeof transactions[0]['product']
      transactions: Array<{
        id: string
        type: string
        quantity: number
        unitCost: number | null
        reference: string | null
        remarks: string | null
        date: Date
        runningBalance: number
      }>
    }>()

    for (const tx of transactions) {
      let group = productGroups.get(tx.productId)
      if (!group) {
        group = { product: tx.product, transactions: [] }
        productGroups.set(tx.productId, group)
      }

      const lastBalance = group.transactions.length > 0
        ? group.transactions[group.transactions.length - 1].runningBalance
        : 0

      let balanceChange = 0
      switch (tx.type) {
        case 'OPENING_STOCK':
        case 'GOODS_RECEIVED':
        case 'RETURNED':
        case 'ADJUSTMENT_IN':
          balanceChange = tx.quantity
          break
        case 'ISSUED':
        case 'ADJUSTMENT_OUT':
          balanceChange = -tx.quantity
          break
      }

      group.transactions.push({
        id: tx.id,
        type: tx.type,
        quantity: tx.quantity,
        unitCost: tx.unitCost,
        reference: tx.reference,
        remarks: tx.remarks,
        date: tx.date,
        runningBalance: lastBalance + balanceChange,
      })
    }

    const data = Array.from(productGroups.entries()).map(([id, group]) => ({
      productId: id,
      product: group.product,
      transactions: group.transactions,
    }))

    return Response.json({ data })
  } catch (error) {
    console.error('GET /api/reports/inventory-ledger error:', error)
    return Response.json({ error: 'Failed to generate inventory ledger report' }, { status: 500 })
  }
}
