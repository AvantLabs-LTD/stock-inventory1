import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/inventory-items/[id] — Get single item by ID
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view inventory items')
    }

    const { id } = await context.params

    const item = await db.inventoryItem.findUnique({ where: { id } })

    if (!item) {
      return Response.json({ error: 'Inventory item not found' }, { status: 404 })
    }

    return Response.json({
      ...item,
      availableStock: Math.max(0, item.quantity - item.issuedQty - item.reservedQty),
    })
  } catch (error) {
    console.error('GET /api/inventory-items/[id] error:', error)
    return Response.json({ error: 'Failed to fetch inventory item' }, { status: 500 })
  }
}

// PUT /api/inventory-items/[id] — Update item fields
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('No permission to manage inventory items')
    }

    const { id } = await context.params
    const body = await request.json()

    // Fetch existing item
    const existing = await db.inventoryItem.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Inventory item not found' }, { status: 404 })
    }

    if (existing.status === 'DELETED') {
      return Response.json({ error: 'Cannot update a deleted item' }, { status: 400 })
    }

    // Build update data with only allowed fields
    const data: Record<string, unknown> = {}

    if (body.quantity !== undefined) data.quantity = body.quantity
    if (body.minimumStock !== undefined) data.minimumStock = body.minimumStock
    if (body.unitCost !== undefined) data.unitCost = body.unitCost
    if (body.unit !== undefined) data.unit = body.unit
    if (body.status !== undefined) data.status = body.status

    const updated = await db.inventoryItem.update({
      where: { id },
      data,
    })

    return Response.json({
      ...updated,
      availableStock: Math.max(0, updated.quantity - updated.issuedQty - updated.reservedQty),
    })
  } catch (error) {
    console.error('PUT /api/inventory-items/[id] error:', error)
    return Response.json({ error: 'Failed to update inventory item' }, { status: 500 })
  }
}

// DELETE /api/inventory-items/[id] — Soft delete (set status to DELETED)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('No permission to manage inventory items')
    }

    const { id } = await context.params

    const existing = await db.inventoryItem.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Inventory item not found' }, { status: 404 })
    }

    if (existing.status === 'DELETED') {
      return Response.json({ error: 'Item is already deleted' }, { status: 400 })
    }

    const deleted = await db.inventoryItem.update({
      where: { id },
      data: { status: 'DELETED' },
    })

    return Response.json(deleted)
  } catch (error) {
    console.error('DELETE /api/inventory-items/[id] error:', error)
    return Response.json({ error: 'Failed to delete inventory item' }, { status: 500 })
  }
}
