import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse } from '@/lib/auth-middleware'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return unauthorizedResponse()

    const months: { month: string; received: number; issued: number; returned: number }[] = []

    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i)
      const monthStart = startOfMonth(date)
      const monthEnd = endOfMonth(date)
      const monthLabel = format(date, 'MMM yyyy')

      const [received, issued, returned] = await Promise.all([
        db.inventoryTransaction.count({
          where: {
            type: { in: ['GOODS_RECEIVED', 'OPENING_STOCK'] },
            date: { gte: monthStart, lte: monthEnd },
          },
        }),
        db.inventoryTransaction.count({
          where: {
            type: 'ISSUED',
            date: { gte: monthStart, lte: monthEnd },
          },
        }),
        db.inventoryTransaction.count({
          where: {
            type: 'RETURNED',
            date: { gte: monthStart, lte: monthEnd },
          },
        }),
      ])

      // Get total quantities
      const [recvQty, issueQty, retQty] = await Promise.all([
        db.inventoryTransaction.aggregate({
          _sum: { quantity: true },
          where: {
            type: { in: ['GOODS_RECEIVED', 'OPENING_STOCK'] },
            date: { gte: monthStart, lte: monthEnd },
          },
        }),
        db.inventoryTransaction.aggregate({
          _sum: { quantity: true },
          where: {
            type: 'ISSUED',
            date: { gte: monthStart, lte: monthEnd },
          },
        }),
        db.inventoryTransaction.aggregate({
          _sum: { quantity: true },
          where: {
            type: 'RETURNED',
            date: { gte: monthStart, lte: monthEnd },
          },
        }),
      ])

      months.push({
        month: monthLabel,
        received: recvQty._sum.quantity || 0,
        issued: issueQty._sum.quantity || 0,
        returned: retQty._sum.quantity || 0,
      })
    }

    return NextResponse.json(months)
  } catch (error) {
    console.error('Chart data error:', error)
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 })
  }
}
