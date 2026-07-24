import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/departments — List all departments with user count and project count
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'departments', 'view')) {
      return forbiddenResponse('No permission to view departments')
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { headName: { contains: search } },
      ]
    }

    const departments = await db.department.findMany({
      where,
      include: {
        _count: { select: { users: true, projects: true } },
      },
      orderBy: { name: 'asc' },
    })

    return Response.json({ data: departments })
  } catch (error) {
    console.error('GET /api/departments error:', error)
    return Response.json({ error: 'Failed to fetch departments' }, { status: 500 })
  }
}

// POST /api/departments — Create department
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'departments', 'create')) {
      return forbiddenResponse('No permission to create departments')
    }

    const body = await request.json()
    const { name, description, headName, phone, status } = body

    if (!name || !name.trim()) {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }

    // Check unique name
    const existingName = await db.department.findUnique({ where: { name: name.trim() } })
    if (existingName) {
      return Response.json({ error: 'Department name already exists' }, { status: 409 })
    }

    // Auto-generate code: DEPT-XX
    const count = await db.department.count()
    const code = `DEPT-${String(count + 1).padStart(2, '0')}`

    // Check unique code
    const existingCode = await db.department.findUnique({ where: { code } })
    if (existingCode) {
      return Response.json({ error: 'Auto-generated code already exists. Please retry.' }, { status: 409 })
    }

    const department = await db.department.create({
      data: {
        code,
        name: name.trim(),
        description: description || null,
        headName: headName || null,
        phone: phone || null,
        status: status || 'ACTIVE',
      },
      include: {
        _count: { select: { users: true, projects: true } },
      },
    })

    return Response.json(department, { status: 201 })
  } catch (error) {
    console.error('POST /api/departments error:', error)
    return Response.json({ error: 'Failed to create department' }, { status: 500 })
  }
}
