import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/stock/opening — List all opening stock entries
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view opening stock')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {
      type: 'OPENING_STOCK',
    }

    if (search) {
      where.product = {
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
          { sku: { contains: search } },
        ],
      }
    }

    const [entries, total] = await Promise.all([
      db.inventoryTransaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: { select: { id: true, name: true, code: true, sku: true, unit: true, status: true } },
        },
      }),
      db.inventoryTransaction.count({ where }),
    ])

    return Response.json({
      data: entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('GET /api/stock/opening error:', error)
    return Response.json({ error: 'Failed to fetch opening stock entries' }, { status: 500 })
  }
}


// POST /api/stock/opening — Set opening stock for a product
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    // Require SUPER_ADMIN or INVENTORY_ADMIN
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can set opening stock')
    }

    const body = await request.json()
    const { productId, quantity, remarks } = body

    if (!productId || !quantity || quantity <= 0) {
      return Response.json(
        { error: 'productId and a positive quantity are required' },
        { status: 400 }
      )
    }

    // Verify product exists and is active
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, status: true },
    })
    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }
    if (product.status === 'DISCONTINUED') {
      return Response.json({ error: 'Cannot set opening stock for a discontinued product' }, { status: 400 })
    }

    // Check if opening stock already exists for this product
    const existingOpening = await db.inventoryTransaction.findFirst({
      where: {
        productId,
        type: 'OPENING_STOCK',
      },
    })
    if (existingOpening) {
      return Response.json(
        { error: 'Opening stock has already been set for this product. Use stock adjustment if you need to modify it.' },
        { status: 409 }
      )
    }

    // Create the inventory transaction
    const transaction = await db.inventoryTransaction.create({
      data: {
        productId,
        type: 'OPENING_STOCK',
        quantity,
        remarks: remarks || 'Opening stock entry',
      },
      include: {
        product: { select: { id: true, name: true, code: true } },
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'OPENING_STOCK_SET',
        entityType: 'Product',
        entityId: productId,
        details: `Set opening stock for ${product.name} (${product.id}): quantity=${quantity}`,
      },
    })

    return Response.json(transaction, { status: 201 })
  } catch (error) {
    console.error('POST /api/stock/opening error:', error)
    return Response.json({ error: 'Failed to set opening stock' }, { status: 500 })
  }
}
