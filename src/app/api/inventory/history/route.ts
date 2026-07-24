import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse } from '@/lib/auth-middleware'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    const search = searchParams.get('search') || ''
    const productId = searchParams.get('productId') || ''
    const type = searchParams.get('type') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''

    const where: Record<string, unknown> = {}

    if (productId) where.productId = productId
    if (type) where.type = type

    if (search) {
      where.product = {
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
          { sku: { contains: search } },
        ],
      }
    }

    if (dateFrom || dateTo) {
      where.date = {} as Record<string, unknown>
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59')
    }

    const [transactions, total] = await Promise.all([
      db.inventoryTransaction.findMany({
        where,
        include: {
          product: { select: { name: true, code: true, sku: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.inventoryTransaction.count({ where }),
    ])

    return NextResponse.json({ transactions, total, page, limit })
  } catch (error) {
    console.error('Inventory history error:', error)
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
