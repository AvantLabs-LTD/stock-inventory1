import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// PUT /api/requisitions/[id]/approve — Approve material requisition
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'inventory_requests', 'approve')) {
      return forbiddenResponse('No permission to approve inventory requests')
    }

    const { id } = await params
    const body = await request.json()
    const { items } = body

    // Validate items array
    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'items must be a non-empty array' }, { status: 400 })
    }

    for (const item of items) {
      if (!item.itemId) {
        return Response.json({ error: 'Each item must have an itemId' }, { status: 400 })
      }
      if (typeof item.approvedQty !== 'number' || item.approvedQty < 0) {
        return Response.json({ error: 'Each item must have a valid approvedQty' }, { status: 400 })
      }
    }

    // Find the requisition with items
    const requisition = await db.materialRequisition.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, unit: true } },
          },
        },
      },
    })

    if (!requisition) {
      return Response.json({ error: 'Requisition not found' }, { status: 404 })
    }

    if (requisition.status !== 'PENDING') {
      return Response.json({ error: `Cannot approve a requisition with status ${requisition.status}` }, { status: 400 })
    }

    // Validate all itemIds belong to this requisition and approvedQty doesn't exceed requiredQty
    const itemMap = new Map(requisition.items.map((item) => [item.id, item]))
    for (const item of items) {
      const existingItem = itemMap.get(item.itemId)
      if (!existingItem) {
        return Response.json({ error: `Item with id ${item.itemId} not found in this requisition` }, { status: 400 })
      }
      if (item.approvedQty > existingItem.requiredQty) {
        return Response.json(
          { error: `Approved quantity (${item.approvedQty}) cannot exceed required quantity (${existingItem.requiredQty}) for ${existingItem.product.name}` },
          { status: 400 }
        )
      }
    }

    // Update requisition status and each item's issuedQty
    const updated = await db.$transaction(async (tx) => {
      // Update the requisition
      const approved = await tx.materialRequisition.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: session.user.id,
          approvedAt: new Date(),
        },
        include: {
          department: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          requestedByUser: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
            },
          },
        },
      })

      // Update each item's issuedQty (capped at requiredQty)
      for (const item of items) {
        const existingItem = itemMap.get(item.itemId)!
        const issuedQty = Math.min(item.approvedQty, existingItem.requiredQty)
        await tx.requisitionItem.update({
          where: { id: item.itemId },
          data: { issuedQty },
        })
      }

      return approved
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'APPROVED',
        entityType: 'MaterialRequisition',
        entityId: id,
        details: `Approved material requisition ${requisition.requisitionNo} with ${items.length} item(s)`,
      },
    })

    return Response.json({ data: updated })
  } catch (error) {
    console.error('PUT /api/requisitions/[id]/approve error:', error)
    return Response.json({ error: 'Failed to approve requisition' }, { status: 500 })
  }
}
