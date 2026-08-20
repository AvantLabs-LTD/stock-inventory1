import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/v1/projects/[id]
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
        _count: { select: { components: true, reservationRequests: true, reservations: true, bomUploads: true } },
        reservationRequests: { orderBy: { createdAt: 'desc' }, take: 5 },
        reservations: { orderBy: { convertedAt: 'desc' }, take: 5 },
      },
    })

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    return Response.json(project)
  } catch (error) {
    console.error('GET /api/v1/projects/[id] error:', error)
    return Response.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

// PUT /api/v1/projects/[id]
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
        _count: { select: { components: true, reservationRequests: true, reservations: true, bomUploads: true } },
      },
    })

    return Response.json(project)
  } catch (error) {
    console.error('PUT /api/v1/projects/[id] error:', error)
    return Response.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

// DELETE /api/v1/projects/[id] — Delete only before canonical history exists.
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
        _count: { select: { components: true, reservationRequests: true, reservations: true, bomUploads: true } },
      },
    })

    if (!existing) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    if (existing._count.reservationRequests > 0 || existing._count.reservations > 0) {
      return Response.json(
        { error: 'Cannot delete project with reservation history' },
        { status: 400 }
      )
    }

    if (existing._count.components > 0 || existing._count.bomUploads > 0) {
      return Response.json(
        { error: 'Cannot delete project with BOM history' },
        { status: 400 }
      )
    }

    await db.project.delete({ where: { id } })

    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/v1/projects/[id] error:', error)
    return Response.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}

