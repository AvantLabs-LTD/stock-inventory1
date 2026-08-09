import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_REASONS = [
  'Purchase',
  'Manual Adjustment',
  'Damaged',
  'Lost',
  'Found',
  'Correction',
  'Goods Received',
  'Issue',
  'Return',
  'Reservation',
  'Release',
  'Opening Stock',
  'Stock Take',
  'Other',
]

// POST /api/inventory-items/[id]/adjust — Adjust stock with audit trail
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('No permission to adjust inventory')
    }

    const { id } = await context.params
    const body = await request.json()
    const { action, reason, quantity, remarks } = body as {
      action: string
      reason: string
      quantity: number
      remarks?: string
    }

    // Validate
    if (!['ADD', 'SUBTRACT'].includes(action)) {
      return Response.json({ error: 'Action must be ADD or SUBTRACT' }, { status: 400 })
    }
    if (!VALID_REASONS.includes(reason)) {
      return Response.json({ error: `Invalid reason. Must be one of: ${VALID_REASONS.join(', ')}` }, { status: 400 })
    }
    if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
      return Response.json({ error: 'Quantity must be a positive integer' }, { status: 400 })
    }

    // Fetch existing item
    const item = await db.inventoryItem.findUnique({ where: { id } })
    if (!item) {
      return Response.json({ error: 'Inventory item not found' }, { status: 404 })
    }
    if (item.status === 'DELETED') {
      return Response.json({ error: 'Cannot adjust a deleted item' }, { status: 400 })
    }

    const previousStock = item.quantity
    let newStock: number

    if (action === 'ADD') {
      newStock = previousStock + quantity
    } else {
      newStock = Math.max(0, previousStock - quantity)
    }

    // Update inventory item and create movement in transaction
    const [updatedItem, movement] = await db.$transaction([
      db.inventoryItem.update({
        where: { id },
        data: {
          quantity: newStock,
          lastTransactionAt: new Date(),
          ...(remarks !== undefined ? { remarks } : {}),
        },
      }),
      db.stockMovement.create({
        data: {
          inventoryItemId: id,
          action,
          reason,
          quantity,
          previousStock,
          newStock,
          remarks: remarks || null,
          userId: session.user.id,
          userName: session.user.name,
        },
      }),
    ])

    return Response.json({
      item: {
        ...updatedItem,
        availableStock: Math.max(0, updatedItem.quantity - updatedItem.issuedQty - updatedItem.reservedQty),
      },
      movement,
    })
  } catch (error) {
    console.error('POST /api/inventory-items/[id]/adjust error:', error)
    return Response.json({ error: 'Failed to adjust stock' }, { status: 500 })
  }
}
