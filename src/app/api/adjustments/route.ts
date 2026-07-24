import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/adjustments — List all stock adjustments
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'adjust')) {
      return forbiddenResponse('No permission to view stock adjustments')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type') || ''

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { product: { name: { contains: search } } },
        { product: { code: { contains: search } } },
        { reason: { contains: search } },
        { adjustedByUser: { name: { contains: search } } },
      ]
    }

    if (type && (type === 'ADJUSTMENT_IN' || type === 'ADJUSTMENT_OUT')) {
      where.type = type
    }

    const [items, total] = await Promise.all([
      db.stockAdjustment.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          adjustedByUser: { select: { id: true, name: true } },
        },
      }),
      db.stockAdjustment.count({ where }),
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
    console.error('GET /api/adjustments error:', error)
    return Response.json({ error: 'Failed to fetch adjustments' }, { status: 500 })
  }
}

// POST /api/adjustments — Create a stock adjustment
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    // Admin only: SUPER_ADMIN, INVENTORY_ADMIN
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only administrators can create stock adjustments')
    }

    const body = await request.json()
    const { productId, type, quantity, reason, remarks } = body

    // Validate required fields
    if (!productId || !type || !quantity || !reason) {
      return Response.json(
        { error: 'productId, type, quantity, and reason are required' },
        { status: 400 }
      )
    }

    if (type !== 'ADJUSTMENT_IN' && type !== 'ADJUSTMENT_OUT') {
      return Response.json(
        { error: 'Type must be ADJUSTMENT_IN or ADJUSTMENT_OUT' },
        { status: 400 }
      )
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
      return Response.json({ error: 'Quantity must be a positive number' }, { status: 400 })
    }

    // Verify product exists
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, unit: true, status: true },
    })
    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    // For ADJUSTMENT_OUT, verify sufficient stock
    if (type === 'ADJUSTMENT_OUT') {
      const transactions = await db.inventoryTransaction.findMany({
        where: { productId },
      })

      let totalIn = 0
      let totalOut = 0

      for (const tx of transactions) {
        switch (tx.type) {
          case 'OPENING_STOCK':
          case 'GOODS_RECEIVED':
          case 'RETURNED':
          case 'ADJUSTMENT_IN':
            totalIn += tx.quantity
            break
          case 'ISSUED':
          case 'ADJUSTMENT_OUT':
            totalOut += tx.quantity
            break
        }
      }

      const reservedResult = await db.reservedInventory.aggregate({
        where: { productId, status: 'ACTIVE' },
        _sum: { quantity: true },
      })
      const reservedStock = reservedResult._sum.quantity || 0

      const availableStock = totalIn - totalOut - reservedStock

      if (availableStock < quantity) {
        return Response.json(
          {
            error: `Insufficient stock for adjustment out. Available: ${availableStock} ${product.unit}, Requested: ${quantity} ${product.unit}`,
            availableStock,
          },
          { status: 400 }
        )
      }
    }

    // Use transaction to create both records atomically
    const adjustment = await db.$transaction(async (tx) => {
      const newAdjustment = await tx.stockAdjustment.create({
        data: {
          productId,
          type,
          quantity,
          reason,
          remarks: remarks || null,
          adjustedBy: session.user.id,
        },
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          adjustedByUser: { select: { id: true, name: true } },
        },
      })

      // Create the inventory transaction
      await tx.inventoryTransaction.create({
        data: {
          productId,
          type,
          quantity,
          reference: newAdjustment.id,
          remarks: remarks || `Stock adjustment (${type}): ${reason}`,
        },
      })

      return newAdjustment
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: type,
        entityType: 'StockAdjustment',
        entityId: adjustment.id,
        details: `Stock ${type === 'ADJUSTMENT_IN' ? 'increase' : 'decrease'} of ${quantity} ${product.unit} for ${product.name}. Reason: ${reason}`,
      },
    })

    return Response.json(adjustment, { status: 201 })
  } catch (error) {
    console.error('POST /api/adjustments error:', error)
    return Response.json({ error: 'Failed to create adjustment' }, { status: 500 })
  }
}
