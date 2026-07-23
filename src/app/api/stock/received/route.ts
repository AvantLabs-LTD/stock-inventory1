import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/stock/received — List all goods received
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view goods received')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const search = searchParams.get('search') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { product: { name: { contains: search } } },
        { product: { code: { contains: search } } },
        { supplier: { name: { contains: search } } },
        { invoiceNumber: { contains: search } },
      ]
    }

    if (dateFrom || dateTo) {
      where.date = {} as Record<string, unknown>
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo)
    }

    const [items, total] = await Promise.all([
      db.goodsReceived.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          supplier: { select: { id: true, name: true } },
          receivedByUser: { select: { id: true, name: true } },
        },
      }),
      db.goodsReceived.count({ where }),
    ])

    return Response.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('GET /api/stock/received error:', error)
    return Response.json({ error: 'Failed to fetch goods received' }, { status: 500 })
  }
}

// POST /api/stock/received — Record goods received
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'receive')) {
      return forbiddenResponse('No permission to record goods received')
    }

    const body = await request.json()
    const {
      productId,
      supplierId,
      source,
      purchaseReference,
      invoiceNumber,
      quantity,
      unitCost,
      date,
      remarks,
    } = body

    if (!productId || !quantity || quantity <= 0 || unitCost === undefined || unitCost < 0) {
      return Response.json(
        { error: 'productId, positive quantity, and unitCost are required' },
        { status: 400 }
      )
    }

    // Verify product exists
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, status: true },
    })
    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }
    if (product.status === 'DISCONTINUED') {
      return Response.json({ error: 'Cannot receive goods for a discontinued product' }, { status: 400 })
    }

    // Verify supplier if provided
    if (supplierId) {
      const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
      if (!supplier) {
        return Response.json({ error: 'Supplier not found' }, { status: 404 })
      }
    }

    // Create goods received record and transaction in a transaction
    const [goodsReceived] = await db.$transaction([
      db.goodsReceived.create({
        data: {
          productId,
          supplierId: supplierId || null,
          source: source || null,
          purchaseReference: purchaseReference || null,
          invoiceNumber: invoiceNumber || null,
          quantity,
          unitCost,
          date: date ? new Date(date) : new Date(),
          receivedBy: session.user.id,
          remarks: remarks || null,
        },
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          supplier: { select: { id: true, name: true } },
          receivedByUser: { select: { id: true, name: true } },
        },
      }),
      db.inventoryTransaction.create({
        data: {
          productId,
          type: 'GOODS_RECEIVED',
          quantity,
          unitCost,
          reference: invoiceNumber || null,
          remarks: remarks || `Goods received${source ? ` from ${source}` : ''}`,
          date: date ? new Date(date) : new Date(),
        },
      }),
    ])

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'GOODS_RECEIVED',
        entityType: 'GoodsReceived',
        entityId: goodsReceived.id,
        details: `Received ${quantity} units of ${product.name} (${product.id}) at $${unitCost}/unit${invoiceNumber ? `, invoice: ${invoiceNumber}` : ''}`,
      },
    })

    return Response.json(goodsReceived, { status: 201 })
  } catch (error) {
    console.error('POST /api/stock/received error:', error)
    return Response.json({ error: 'Failed to record goods received' }, { status: 500 })
  }
}
