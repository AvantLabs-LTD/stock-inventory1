import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/requisitions — List all material requisitions
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

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { requisitionNo: { contains: search } },
        { department: { name: { contains: search } } },
        { project: { name: { contains: search } } },
        { employeeName: { contains: search } },
        { items: { some: { product: { name: { contains: search } } } } },
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

    const [items, total] = await Promise.all([
      db.materialRequisition.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          department: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          requestedByUser: { select: { id: true, name: true, email: true } },
          items: {
            select: {
              id: true,
              specDescription: true,
              requiredQty: true,
              issuedQty: true,
              remarks: true,
              product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
            },
          },
        },
      }),
      db.materialRequisition.count({ where }),
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
    console.error('GET /api/requisitions error:', error)
    return Response.json({ error: 'Failed to fetch material requisitions' }, { status: 500 })
  }
}

// POST /api/requisitions — Create material requisition
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'inventory_requests', 'create')) {
      return forbiddenResponse('No permission to create inventory requests')
    }

    const body = await request.json()
    const { departmentId, projectId, employeeName, date, items } = body

    // Validate required fields
    if (!departmentId || !projectId || !employeeName) {
      return Response.json(
        { error: 'departmentId, projectId, and employeeName are required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(items) || items.length === 0) {
      return Response.json(
        { error: 'items must be a non-empty array with at least 1 item' },
        { status: 400 }
      )
    }

    for (const item of items) {
      if (!item.productId) {
        return Response.json({ error: 'Each item must have a productId' }, { status: 400 })
      }
      if (typeof item.requiredQty !== 'number' || item.requiredQty <= 0) {
        return Response.json({ error: 'Each item must have a requiredQty greater than 0' }, { status: 400 })
      }
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

    // Verify all products exist and are active
    const productIds = items.map((item: { productId: string }) => item.productId)
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, status: true },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))
    for (const pid of productIds) {
      const product = productMap.get(pid)
      if (!product) {
        return Response.json({ error: `Product with id ${pid} not found` }, { status: 404 })
      }
      if (product.status === 'DISCONTINUED') {
        return Response.json({ error: `Cannot request discontinued product: ${product.name}` }, { status: 400 })
      }
    }

    // Generate requisition number: MR-YYYYMMDD-NNN
    const today = new Date()
    const dateStr = today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0')
    const prefix = `MR-${dateStr}-`

    const lastRequisition = await db.materialRequisition.findFirst({
      where: { requisitionNo: { startsWith: prefix } },
      orderBy: { requisitionNo: 'desc' },
      select: { requisitionNo: true },
    })

    let seqNo = 1
    if (lastRequisition) {
      const lastSeq = parseInt(lastRequisition.requisitionNo.slice(prefix.length), 10)
      seqNo = lastSeq + 1
    }
    const requisitionNo = `${prefix}${String(seqNo).padStart(3, '0')}`

    // Create the material requisition with nested items
    const requisition = await db.materialRequisition.create({
      data: {
        requisitionNo,
        date: date ? new Date(date) : new Date(),
        departmentId,
        projectId,
        requestedBy: session.user.id,
        employeeName,
        status: 'PENDING',
        items: {
          create: items.map((item: { productId: string; specDescription?: string; requiredQty: number; remarks?: string }) => ({
            productId: item.productId,
            specDescription: item.specDescription || null,
            requiredQty: item.requiredQty,
            issuedQty: 0,
            remarks: item.remarks || null,
          })),
        },
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        requestedByUser: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
          },
        },
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'CREATED',
        entityType: 'MaterialRequisition',
        entityId: requisition.id,
        details: `Created material requisition ${requisitionNo} with ${items.length} item(s) for ${employeeName}`,
      },
    })

    return Response.json(requisition, { status: 201 })
  } catch (error) {
    console.error('POST /api/requisitions error:', error)
    return Response.json({ error: 'Failed to create material requisition' }, { status: 500 })
  }
}
