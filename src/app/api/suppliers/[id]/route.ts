import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/suppliers/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'suppliers', 'view')) {
      return forbiddenResponse('No permission to view suppliers')
    }

    const { id } = await params

    const supplier = await db.supplier.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true } },
      },
    })

    if (!supplier) {
      return Response.json({ error: 'Supplier not found' }, { status: 404 })
    }

    return Response.json(supplier)
  } catch (error) {
    console.error('GET /api/suppliers/[id] error:', error)
    return Response.json({ error: 'Failed to fetch supplier' }, { status: 500 })
  }
}

// PUT /api/suppliers/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'suppliers', 'edit')) {
      return forbiddenResponse('No permission to edit suppliers')
    }

    const { id } = await params
    const body = await request.json()
    const { name, contactPerson, phone, email, address, notes, status } = body

    const existing = await db.supplier.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Supplier not found' }, { status: 404 })
    }

    // Check unique name if changed
    if (name && name !== existing.name) {
      const existingName = await db.supplier.findUnique({ where: { name } })
      if (existingName) {
        return Response.json({ error: 'Supplier with this name already exists' }, { status: 409 })
      }
    }

    const supplier = await db.supplier.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(contactPerson !== undefined && { contactPerson: contactPerson || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(email !== undefined && { email: email || null }),
        ...(address !== undefined && { address: address || null }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(status && { status }),
      },
      include: {
        _count: { select: { products: true } },
      },
    })

    return Response.json(supplier)
  } catch (error) {
    console.error('PUT /api/suppliers/[id] error:', error)
    return Response.json({ error: 'Failed to update supplier' }, { status: 500 })
  }
}

// DELETE /api/suppliers/[id] — Soft delete (set status to INACTIVE)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'suppliers', 'delete')) {
      return forbiddenResponse('No permission to delete suppliers')
    }

    const { id } = await params

    const existing = await db.supplier.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Supplier not found' }, { status: 404 })
    }

    const supplier = await db.supplier.update({
      where: { id },
      data: { status: 'INACTIVE' },
    })

    return Response.json(supplier)
  } catch (error) {
    console.error('DELETE /api/suppliers/[id] error:', error)
    return Response.json({ error: 'Failed to delete supplier' }, { status: 500 })
  }
}
