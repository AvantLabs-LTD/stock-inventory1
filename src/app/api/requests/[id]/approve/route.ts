import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// PUT /api/requests/[id]/approve — Approve inventory request
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
    const { approvedQty } = body

    // Find the request
    const req = await db.inventoryRequest.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, unit: true } },
      },
    })

    if (!req) {
      return Response.json({ error: 'Request not found' }, { status: 404 })
    }

    if (req.status !== 'PENDING') {
      return Response.json({ error: `Cannot approve a request with status ${req.status}` }, { status: 400 })
    }

    // Validate approvedQty
    if (typeof approvedQty !== 'number' || approvedQty <= 0) {
      return Response.json({ error: 'Approved quantity must be a positive number' }, { status: 400 })
    }

    if (approvedQty > req.quantity) {
      return Response.json(
        { error: `Approved quantity (${approvedQty}) cannot exceed requested quantity (${req.quantity})` },
        { status: 400 }
      )
    }

    // Calculate available stock
    const transactions = await db.inventoryTransaction.findMany({
      where: { productId: req.productId },
    })

    let totalIn = 0
    let totalOut = 0

    for (const tx of transactions) {
      switch (tx.type) {
        case 'OPENING_STOCK':
        case 'GOODS_RECEIVED':
        case 'RETURNED':
        case 'ADJUSTMENT_IN':
          totalIn += tx.quantity
          break
        case 'ISSUED':
        case 'ADJUSTMENT_OUT':
          totalOut += tx.quantity
          break
      }
    }

    const reservedResult = await db.reservedInventory.aggregate({
      where: { productId: req.productId, status: 'ACTIVE' },
      _sum: { quantity: true },
    })
    const reservedStock = reservedResult._sum.quantity || 0

    const availableStock = totalIn - totalOut - reservedStock

    // Check sufficient stock
    if (availableStock < approvedQty) {
      return Response.json(
        {
          error: `Insufficient stock. Available: ${availableStock} ${req.product.unit}, Approved Qty: ${approvedQty} ${req.product.unit}`,
          availableStock,
          approvedQty,
          unit: req.product.unit,
        },
        { status: 400 }
      )
    }

    // Determine new status
    const newStatus = approvedQty < req.quantity ? 'PARTIAL_APPROVED' : 'APPROVED'

    // Update the request
    const updated = await db.inventoryRequest.update({
      where: { id },
      data: {
        approvedQty,
        status: newStatus,
        approvedBy: session.user.id,
        approvedAt: new Date(),
      },
      include: {
        product: { select: { id: true, name: true, code: true, unit: true } },
        department: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        requestedByUser: { select: { id: true, name: true, email: true } },
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'APPROVED',
        entityType: 'InventoryRequest',
        entityId: id,
        details: `Approved ${approvedQty} ${req.product.unit} of ${req.product.name} (requested: ${req.quantity}), status: ${newStatus}`,
      },
    })

    return Response.json({ data: updated })
  } catch (error) {
    console.error('PUT /api/requests/[id]/approve error:', error)
    return Response.json({ error: 'Failed to approve request' }, { status: 500 })
  }
}
