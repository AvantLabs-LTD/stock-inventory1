import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── PUT /api/opening-stock/projects/:id — Update ProjectField ──────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can update project fields')
    }

    const { id } = await params
    const body = await request.json()
    const { name, code } = body

    const existing = await db.projectField.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Project field not found' }, { status: 404 })
    }

    const trimmedName = name?.trim()
    const trimmedCode = code?.trim()

    if (!trimmedName && !trimmedCode) {
      return Response.json({ error: 'At least name or code must be provided' }, { status: 400 })
    }

    // Check unique name if changed
    if (trimmedName && trimmedName !== existing.name) {
      const nameExists = await db.projectField.findUnique({ where: { name: trimmedName } })
      if (nameExists) {
        return Response.json({ error: 'A project field with this name already exists' }, { status: 409 })
      }
    }

    // Check unique code if changed
    if (trimmedCode && trimmedCode !== existing.code) {
      const codeExists = await db.projectField.findUnique({ where: { code: trimmedCode } })
      if (codeExists) {
        return Response.json({ error: 'A project field with this code already exists' }, { status: 409 })
      }
    }

    const updated = await db.projectField.update({
      where: { id },
      data: {
        ...(trimmedName ? { name: trimmedName } : {}),
        ...(trimmedCode ? { code: trimmedCode } : {}),
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'PROJECT_FIELD_UPDATED',
        entityType: 'ProjectField',
        entityId: id,
        details: `Updated project field: ${existing.name} -> ${updated.name} (${existing.code} -> ${updated.code})`,
      },
    })

    return Response.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('PUT /api/opening-stock/projects/:id error:', error)
    return Response.json({ error: 'Failed to update project field' }, { status: 500 })
  }
}

// ─── DELETE /api/opening-stock/projects/:id — Delete ProjectField ────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can delete project fields')
    }

    const { id } = await params

    const existing = await db.projectField.findUnique({
      where: { id },
      include: {
        productQtys: { select: { id: true } },
      },
    })

    if (!existing) {
      return Response.json({ error: 'Project field not found' }, { status: 404 })
    }

    // Check if it has product quantities linked
    if (existing.productQtys.length > 0) {
      return Response.json({
        error: `Cannot delete project field. It has ${existing.productQtys.length} linked product quantities. Remove those first.`,
      }, { status: 400 })
    }

    await db.projectField.delete({ where: { id } })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'PROJECT_FIELD_DELETED',
        entityType: 'ProjectField',
        entityId: id,
        details: `Deleted project field: ${existing.name} (${existing.code})`,
      },
    })

    return Response.json({ success: true, message: 'Project field deleted' })
  } catch (error) {
    console.error('DELETE /api/opening-stock/projects/:id error:', error)
    return Response.json({ error: 'Failed to delete project field' }, { status: 500 })
  }
}
