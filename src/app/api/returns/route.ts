import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/returns — List all inventory returns
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'returns', 'view')) {
      return forbiddenResponse('No permission to view returns')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const search = searchParams.get('search') || ''
    const departmentId = searchParams.get('departmentId') || ''
    const projectId = searchParams.get('projectId') || ''
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

    if (dateFrom || dateTo) {
      where.date = {} as Record<string, unknown>
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    const [items, total] = await Promise.all([
      db.inventoryReturn.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          department: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          returnedByUser: { select: { id: true, name: true } },
        },
      }),
      db.inventoryReturn.count({ where }),
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
    console.error('GET /api/returns error:', error)
    return Response.json({ error: 'Failed to fetch returns' }, { status: 500 })
  }
}

// POST /api/returns — Record a return
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'returns', 'return')) {
      return forbiddenResponse('No permission to record returns')
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

    // Verify product exists
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, unit: true, status: true },
    })
    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    // Verify department exists
    const department = await db.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true },
    })
    if (!department) {
      return Response.json({ error: 'Department not found' }, { status: 404 })
    }

    // Verify project exists and belongs to the department
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, departmentId: true },
    })
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }
    if (project.departmentId !== departmentId) {
      return Response.json({ error: 'Project does not belong to the selected department' }, { status: 400 })
    }

    // Use transaction to create both records atomically
    const returnRecord = await db.$transaction(async (tx) => {
      const newReturn = await tx.inventoryReturn.create({
        data: {
          productId,
          departmentId,
          projectId,
          returnedBy: session.user.id,
          employeeName,
          quantity,
          remarks: remarks || null,
        },
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          department: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          returnedByUser: { select: { id: true, name: true } },
        },
      })

      // Create the inventory transaction (RETURNED increases available stock)
      await tx.inventoryTransaction.create({
        data: {
          productId,
          type: 'RETURNED',
          quantity,
          reference: newReturn.id,
          remarks: remarks || `Returned from ${department.name} - ${project.name} (${employeeName})`,
        },
      })

      return newReturn
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'RETURNED',
        entityType: 'InventoryReturn',
        entityId: returnRecord.id,
        details: `Returned ${quantity} ${product.unit} of ${product.name} from ${department.name} - ${project.name} (${employeeName})`,
      },
    })

    return Response.json(returnRecord, { status: 201 })
  } catch (error) {
    console.error('POST /api/returns error:', error)
    return Response.json({ error: 'Failed to record return' }, { status: 500 })
  }
}
