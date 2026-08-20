import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/v1/projects — List with search, filter, pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'projects', 'view')) {
      return forbiddenResponse('No permission to view projects')
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const departmentId = searchParams.get('departmentId') || ''
    const status = searchParams.get('status') || ''
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 10))

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
      ]
    }

    if (departmentId) {
      where.departmentId = departmentId
    }

    if (status) {
      where.status = status
    }

    const [projects, total] = await Promise.all([
      db.project.findMany({
        where,
        include: {
          department: { select: { id: true, name: true, code: true } },
          _count: { select: { components: true, reservationRequests: true, reservations: true, bomUploads: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.project.count({ where }),
    ])

    return Response.json({
      data: projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('GET /api/v1/projects error:', error)
    return Response.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

// POST /api/v1/projects — Create project
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'projects', 'create')) {
      return forbiddenResponse('No permission to create projects')
    }

    const body = await request.json()
    const { name, departmentId, description, startDate, endDate, status } = body

    if (!name || !name.trim()) {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!departmentId) {
      return Response.json({ error: 'Department is required' }, { status: 400 })
    }

    // Verify department exists
    const dept = await db.department.findUnique({ where: { id: departmentId } })
    if (!dept) {
      return Response.json({ error: 'Department not found' }, { status: 404 })
    }

    // Auto-generate code: PRJ-XXXX
    const count = await db.project.count()
    const code = `PRJ-${String(count + 1).padStart(4, '0')}`

    // Check unique code
    const existingCode = await db.project.findUnique({ where: { code } })
    if (existingCode) {
      return Response.json({ error: 'Auto-generated code already exists. Please retry.' }, { status: 409 })
    }

    const project = await db.project.create({
      data: {
        code,
        name: name.trim(),
        departmentId,
        description: description || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: status || 'ACTIVE',
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { components: true, reservationRequests: true, reservations: true, bomUploads: true } },
      },
    })

    return Response.json(project, { status: 201 })
  } catch (error) {
    console.error('POST /api/v1/projects error:', error)
    return Response.json({ error: 'Failed to create project' }, { status: 500 })
  }
}

