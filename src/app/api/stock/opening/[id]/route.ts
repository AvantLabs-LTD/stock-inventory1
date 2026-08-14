import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/stock/opening/:id — Get single opening stock entry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view opening stock')
    }

    const { id } = await params

    const entry = await db.inventoryTransaction.findFirst({
      where: { id, type: 'OPENING_STOCK' },
      include: {
        product: {
          select: {
            id: true, name: true, code: true, sku: true, unit: true, status: true,
            image: true,
            category: { select: { id: true, name: true, code: true } },
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!entry) {
      return Response.json({ error: 'Opening stock entry not found' }, { status: 404 })
    }

    return Response.json({
      ...entry,
      date: entry.date.toISOString(),
      createdAt: entry.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('GET /api/stock/opening/:id error:', error)
    return Response.json({ error: 'Failed to fetch opening stock entry' }, { status: 500 })
  }
}

// PUT /api/stock/opening/:id — Edit opening stock entry
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can edit opening stock')
    }

    const { id } = await params
    const body = await request.json()
    const { quantity, remarks } = body

    // Find existing opening stock entry
    const existing = await db.inventoryTransaction.findFirst({
      where: { id, type: 'OPENING_STOCK' },
      include: {
        product: { select: { id: true, name: true, code: true } },
      },
    })

    if (!existing) {
      return Response.json({ error: 'Opening stock entry not found' }, { status: 404 })
    }

    // Build update data
    const updateData: Record<string, unknown> = {}
    const changes: string[] = []

    if (quantity !== undefined && quantity !== null) {
      if (typeof quantity !== 'number' || quantity <= 0) {
        return Response.json({ error: 'Quantity must be a positive number' }, { status: 400 })
      }
      updateData.quantity = quantity
      if (quantity !== existing.quantity) {
        changes.push(`quantity: ${existing.quantity} → ${quantity}`)
      }
    }

    if (remarks !== undefined) {
      updateData.remarks = remarks || null
      if ((remarks || null) !== existing.remarks) {
        changes.push(`remarks updated`)
      }
    }

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 })
    }

    const updated = await db.inventoryTransaction.update({
      where: { id },
      data: updateData,
      include: {
        product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'OPENING_STOCK_UPDATED',
        entityType: 'InventoryTransaction',
        entityId: id,
        details: `Edited opening stock for ${existing.product.name}: ${changes.join(', ')}`,
      },
    })

    return Response.json({
      ...updated,
      date: updated.date.toISOString(),
      createdAt: updated.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('PUT /api/stock/opening/:id error:', error)
    return Response.json({ error: 'Failed to update opening stock' }, { status: 500 })
  }
}

// DELETE /api/stock/opening/:id — Delete opening stock entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can delete opening stock')
    }

    const { id } = await params

    // Find the opening stock entry
    const existing = await db.inventoryTransaction.findFirst({
      where: { id, type: 'OPENING_STOCK' },
      include: {
        product: { select: { id: true, name: true } },
      },
    })

    if (!existing) {
      return Response.json({ error: 'Opening stock entry not found' }, { status: 404 })
    }

    // Check if there are other (non-opening) transactions for this product
    const otherTransactions = await db.inventoryTransaction.count({
      where: {
        productId: existing.productId,
        type: { not: 'OPENING_STOCK' },
      },
    })

    if (otherTransactions > 0) {
      return Response.json(
        {
          error: `Cannot delete opening stock. This product has ${otherTransactions} other transaction(s). Use stock adjustment if you need to modify the balance.`,
        },
        { status: 400 }
      )
    }

    // Delete the entry
    await db.inventoryTransaction.delete({ where: { id } })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'OPENING_STOCK_DELETED',
        entityType: 'InventoryTransaction',
        entityId: id,
        details: `Deleted opening stock entry for ${existing.product.name} (quantity was ${existing.quantity})`,
      },
    })

    return Response.json({ success: true, message: 'Opening stock entry deleted' })
  } catch (error) {
    console.error('DELETE /api/stock/opening/:id error:', error)
    return Response.json({ error: 'Failed to delete opening stock' }, { status: 500 })
  }
}
