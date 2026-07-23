import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/reserved — List all reservations
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reserved_inventory', 'view')) {
      return forbiddenResponse('No permission to view reservations')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const search = searchParams.get('search') || ''
    const projectId = searchParams.get('projectId') || ''
    const status = searchParams.get('status') || ''

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { product: { name: { contains: search } } },
        { product: { code: { contains: search } } },
        { project: { name: { contains: search } } },
        { project: { code: { contains: search } } },
        { reason: { contains: search } },
      ]
    }

    if (projectId) {
      where.projectId = projectId
    }

    if (status) {
      where.status = status
    }

    const [items, total] = await Promise.all([
      db.reservedInventory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          project: { select: { id: true, name: true, code: true } },
          reservedByUser: { select: { id: true, name: true, email: true } },
          releasedByUser: { select: { id: true, name: true } },
        },
      }),
      db.reservedInventory.count({ where }),
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
    console.error('GET /api/reserved error:', error)
    return Response.json({ error: 'Failed to fetch reservations' }, { status: 500 })
  }
}

// POST /api/reserved — Create reservation
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reserved_inventory', 'reserve')) {
      return forbiddenResponse('No permission to create reservations')
    }

    const body = await request.json()
    const { productId, projectId, quantity, reason, remarks } = body

    // Validate required fields
    if (!productId || !projectId || !quantity) {
      return Response.json(
        { error: 'productId, projectId, and quantity are required' },
        { status: 400 }
      )
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
      return Response.json({ error: 'Quantity must be a positive number' }, { status: 400 })
    }

    // Verify product exists and is active
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, status: true, unit: true },
    })
    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }
    if (product.status === 'DISCONTINUED') {
      return Response.json({ error: 'Cannot reserve discontinued products' }, { status: 400 })
    }

    // Verify project exists
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, status: true },
    })
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }
    if (project.status === 'CANCELLED') {
      return Response.json({ error: 'Cannot reserve for a cancelled project' }, { status: 400 })
    }

    // Calculate available stock
    // Available = (Opening + Received + Returned + AdjIn) - Issued - AdjOut - Reserved
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

    // Check sufficient stock
    if (availableStock < quantity) {
      return Response.json(
        {
          error: `Insufficient available stock. Available: ${availableStock} ${product.unit}, Requested: ${quantity} ${product.unit}`,
          availableStock,
          requestedQuantity: quantity,
          unit: product.unit,
        },
        { status: 400 }
      )
    }

    // Create the reservation
    const reservation = await db.reservedInventory.create({
      data: {
        productId,
        projectId,
        quantity,
        reason: reason || null,
        remarks: remarks || null,
        reservedBy: session.user.id,
        status: 'ACTIVE',
      },
      include: {
        product: { select: { id: true, name: true, code: true, unit: true } },
        project: { select: { id: true, name: true, code: true } },
        reservedByUser: { select: { id: true, name: true, email: true } },
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'RESERVED',
        entityType: 'ReservedInventory',
        entityId: reservation.id,
        details: `Reserved ${quantity} ${product.unit} of ${product.name} for ${project.name}${reason ? ` (Reason: ${reason})` : ''}`,
      },
    })

    return Response.json(reservation, { status: 201 })
  } catch (error) {
    console.error('POST /api/reserved error:', error)
    return Response.json({ error: 'Failed to create reservation' }, { status: 500 })
  }
}
