import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/issues — List all inventory issues
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'issue_inventory', 'view')) {
      return forbiddenResponse('No permission to view inventory issues')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const search = searchParams.get('search') || ''
    const departmentId = searchParams.get('departmentId') || ''
    const projectId = searchParams.get('projectId') || ''
    const productId = searchParams.get('productId') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { product: { name: { contains: search } } },
        { product: { code: { contains: search } } },
        { department: { name: { contains: search } } },
        { project: { name: { contains: search } } },
        { employeeName: { contains: search } },
      ]
    }

    if (departmentId) {
      where.departmentId = departmentId
    }

    if (projectId) {
      where.projectId = projectId
    }

    if (productId) {
      where.productId = productId
    }

    if (dateFrom || dateTo) {
      where.date = {} as Record<string, unknown>
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    const [items, total] = await Promise.all([
      db.inventoryIssue.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          department: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          issuedByUser: { select: { id: true, name: true } },
        },
      }),
      db.inventoryIssue.count({ where }),
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
    console.error('GET /api/issues error:', error)
    return Response.json({ error: 'Failed to fetch inventory issues' }, { status: 500 })
  }
}

// POST /api/issues — Issue inventory
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'issue_inventory', 'issue')) {
      return forbiddenResponse('No permission to issue inventory')
    }

    const body = await request.json()
    const { productId, departmentId, projectId, employeeName, quantity, remarks } = body

    // Validate required fields
    if (!productId || !departmentId || !projectId || !employeeName || !quantity) {
      return Response.json(
        { error: 'productId, departmentId, projectId, employeeName, and quantity are required' },
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
      return Response.json({ error: 'Cannot issue discontinued products' }, { status: 400 })
    }

    // Verify department exists
    const department = await db.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, status: true },
    })
    if (!department) {
      return Response.json({ error: 'Department not found' }, { status: 404 })
    }
    if (department.status !== 'ACTIVE') {
      return Response.json({ error: 'Cannot issue to an inactive department' }, { status: 400 })
    }

    // Verify project exists and belongs to the department
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, departmentId: true, status: true },
    })
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }
    if (project.departmentId !== departmentId) {
      return Response.json({ error: 'Project does not belong to the selected department' }, { status: 400 })
    }
    if (project.status === 'CANCELLED') {
      return Response.json({ error: 'Cannot issue to a cancelled project' }, { status: 400 })
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
          error: `Insufficient stock. Available: ${availableStock} ${product.unit}, Requested: ${quantity} ${product.unit}`,
          availableStock,
          requestedQuantity: quantity,
          unit: product.unit,
        },
        { status: 400 }
      )
    }

    // Use interactive transaction to create both records atomically
    const issue = await db.$transaction(async (tx) => {
      // Create the issue record first
      const newIssue = await tx.inventoryIssue.create({
        data: {
          productId,
          departmentId,
          projectId,
          issuedBy: session.user.id,
          employeeName,
          quantity,
          remarks: remarks || null,
        },
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          department: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          issuedByUser: { select: { id: true, name: true } },
        },
      })

      // Create the inventory transaction with reference to the issue
      await tx.inventoryTransaction.create({
        data: {
          productId,
          type: 'ISSUED',
          quantity,
          reference: newIssue.id,
          remarks: remarks || `Issued to ${department.name} - ${project.name} (${employeeName})`,
        },
      })

      return newIssue
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'ISSUED',
        entityType: 'InventoryIssue',
        entityId: issue.id,
        details: `Issued ${quantity} ${product.unit} of ${product.name} to ${department.name} - ${project.name} for ${employeeName}`,
      },
    })

    return Response.json(issue, { status: 201 })
  } catch (error) {
    console.error('POST /api/issues error:', error)
    return Response.json({ error: 'Failed to issue inventory' }, { status: 500 })
  }
}
