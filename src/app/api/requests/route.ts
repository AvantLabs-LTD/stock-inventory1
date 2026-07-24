import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/requests — List all inventory requests
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'inventory_requests', 'view')) {
      return forbiddenResponse('No permission to view inventory requests')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const search = searchParams.get('search') || ''
    const departmentId = searchParams.get('departmentId') || ''
    const projectId = searchParams.get('projectId') || ''
    const status = searchParams.get('status') || ''
    const priority = searchParams.get('priority') || ''

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { product: { name: { contains: search } } },
        { product: { code: { contains: search } } },
        { department: { name: { contains: search } } },
        { project: { name: { contains: search } } },
        { employeeName: { contains: search } },
        { requestedByUser: { name: { contains: search } } },
      ]
    }

    if (departmentId) {
      where.departmentId = departmentId
    }

    if (projectId) {
      where.projectId = projectId
    }

    if (status) {
      where.status = status
    }

    if (priority) {
      where.priority = priority
    }

    const [items, total] = await Promise.all([
      db.inventoryRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          department: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          requestedByUser: { select: { id: true, name: true, email: true } },
        },
      }),
      db.inventoryRequest.count({ where }),
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
    console.error('GET /api/requests error:', error)
    return Response.json({ error: 'Failed to fetch inventory requests' }, { status: 500 })
  }
}

// POST /api/requests — Create inventory request
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'inventory_requests', 'create')) {
      return forbiddenResponse('No permission to create inventory requests')
    }

    const body = await request.json()
    const { productId, departmentId, projectId, employeeName, quantity, priority, reason } = body

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

    // Validate priority
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
    if (priority && !validPriorities.includes(priority)) {
      return Response.json({ error: 'Invalid priority. Must be LOW, MEDIUM, HIGH, or URGENT' }, { status: 400 })
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
      return Response.json({ error: 'Cannot request discontinued products' }, { status: 400 })
    }

    // Verify department exists
    const department = await db.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, status: true },
    })
    if (!department) {
      return Response.json({ error: 'Department not found' }, { status: 404 })
    }

    // Verify project exists and belongs to department
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

    // Create the inventory request
    const req = await db.inventoryRequest.create({
      data: {
        productId,
        departmentId,
        projectId,
        requestedBy: session.user.id,
        employeeName,
        quantity,
        priority: priority || 'MEDIUM',
        reason: reason || null,
        status: 'PENDING',
      },
      include: {
        product: { select: { id: true, name: true, code: true, unit: true } },
        department: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        requestedByUser: { select: { id: true, name: true, email: true } },
      },
    })

    return Response.json(req, { status: 201 })
  } catch (error) {
    console.error('POST /api/requests error:', error)
    return Response.json({ error: 'Failed to create inventory request' }, { status: 500 })
  }
}
