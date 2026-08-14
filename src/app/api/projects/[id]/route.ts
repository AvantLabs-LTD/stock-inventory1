import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/projects/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'projects', 'view')) {
      return forbiddenResponse('No permission to view projects')
    }

    const { id } = await params

    const project = await db.project.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true, headName: true, phone: true } },
        _count: { select: { issues: true, requests: true, reservations: true, returns: true } },
        issues: {
          select: { id: true, date: true, quantity, employeeName, remarks: true },
          orderBy: { date: 'desc' },
          take: 5,
        },
        requests: {
          select: { id: true, createdAt: true, quantity, approvedQty, employeeName, status: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    })

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    return Response.json(project)
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error)
    return Response.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

// PUT /api/projects/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'projects', 'edit')) {
      return forbiddenResponse('No permission to edit projects')
    }

    const { id } = await params
    const body = await request.json()
    const { name, departmentId, description, startDate, endDate, status } = body

    const existing = await db.project.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    // Verify department if changed
    if (departmentId && departmentId !== existing.departmentId) {
      const dept = await db.department.findUnique({ where: { id: departmentId } })
      if (!dept) {
        return Response.json({ error: 'Department not found' }, { status: 404 })
      }
    }

    const project = await db.project.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(departmentId && { departmentId }),
        ...(description !== undefined && { description: description || null }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(status && { status }),
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { issues: true, requests: true } },
      },
    })

    return Response.json(project)
  } catch (error) {
    console.error('PUT /api/projects/[id] error:', error)
    return Response.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

// DELETE /api/projects/[id] — Delete only if no issues and no requests
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'projects', 'delete')) {
      return forbiddenResponse('No permission to delete projects')
    }

    const { id } = await params

    const existing = await db.project.findUnique({
      where: { id },
      include: {
        _count: { select: { issues: true, requests: true, reservations: true, returns: true } },
      },
    })

    if (!existing) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    if (existing._count.issues > 0) {
      return Response.json(
        { error: 'Cannot delete project with inventory issues' },
        { status: 400 }
      )
    }

    if (existing._count.requests > 0) {
      return Response.json(
        { error: 'Cannot delete project with inventory requests' },
        { status: 400 }
      )
    }

    await db.project.delete({ where: { id } })

    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/projects/[id] error:', error)
    return Response.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
