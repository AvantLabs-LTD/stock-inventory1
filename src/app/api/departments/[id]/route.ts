import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/departments/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'departments', 'view')) {
      return forbiddenResponse('No permission to view departments')
    }

    const { id } = await params

    const department = await db.department.findUnique({
      where: { id },
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true, status: true },
          orderBy: { name: 'asc' },
        },
        projects: {
          select: { id: true, name: true, code: true, status: true, startDate: true, endDate: true },
          orderBy: { name: 'asc' },
        },
        _count: { select: { users: true, projects: true, issues: true, requests: true, returns: true } },
      },
    })

    if (!department) {
      return Response.json({ error: 'Department not found' }, { status: 404 })
    }

    return Response.json(department)
  } catch (error) {
    console.error('GET /api/departments/[id] error:', error)
    return Response.json({ error: 'Failed to fetch department' }, { status: 500 })
  }
}

// PUT /api/departments/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'departments', 'edit')) {
      return forbiddenResponse('No permission to edit departments')
    }

    const { id } = await params
    const body = await request.json()
    const { name, description, headName, phone, status } = body

    const existing = await db.department.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Department not found' }, { status: 404 })
    }

    // Check unique name if changed
    if (name && name.trim() !== existing.name) {
      const dup = await db.department.findUnique({ where: { name: name.trim() } })
      if (dup) {
        return Response.json({ error: 'Department name already exists' }, { status: 409 })
      }
    }

    const department = await db.department.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description || null }),
        ...(headName !== undefined && { headName: headName || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(status && { status }),
      },
      include: {
        _count: { select: { users: true, projects: true } },
      },
    })

    return Response.json(department)
  } catch (error) {
    console.error('PUT /api/departments/[id] error:', error)
    return Response.json({ error: 'Failed to update department' }, { status: 500 })
  }
}

// DELETE /api/departments/[id] — Delete only if no users and no projects
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'departments', 'delete')) {
      return forbiddenResponse('No permission to delete departments')
    }

    const { id } = await params

    const existing = await db.department.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, projects: true, issues: true, requests: true, returns: true } },
      },
    })

    if (!existing) {
      return Response.json({ error: 'Department not found' }, { status: 404 })
    }

    if (existing._count.users > 0) {
      return Response.json(
        { error: 'Cannot delete department with assigned users' },
        { status: 400 }
      )
    }

    if (existing._count.projects > 0) {
      return Response.json(
        { error: 'Cannot delete department with associated projects' },
        { status: 400 }
      )
    }

    await db.department.delete({ where: { id } })

    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/departments/[id] error:', error)
    return Response.json({ error: 'Failed to delete department' }, { status: 500 })
  }
}
