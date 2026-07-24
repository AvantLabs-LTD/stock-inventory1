import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// PUT /api/requests/[id]/complete — Complete inventory request
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    // SUPER_ADMIN, INVENTORY_ADMIN, STORE_KEEPER can complete requests
    const canComplete = hasPermission(session.user.role, 'inventory_requests', 'edit')
    if (!canComplete) {
      return forbiddenResponse('No permission to complete inventory requests')
    }

    const { id } = await params

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

    if (req.status !== 'APPROVED' && req.status !== 'PARTIAL_APPROVED') {
      return Response.json(
        { error: `Cannot complete a request with status ${req.status}. Must be APPROVED or PARTIAL_APPROVED.` },
        { status: 400 }
      )
    }

    const completeQty = req.approvedQty || req.quantity

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

    // Check sufficient stock before completing
    if (availableStock < completeQty) {
      return Response.json(
        {
          error: `Insufficient stock to complete. Available: ${availableStock} ${req.product.unit}, Required: ${completeQty} ${req.product.unit}`,
          availableStock,
          requiredQty: completeQty,
          unit: req.product.unit,
        },
        { status: 400 }
      )
    }

    // Update request and create inventory transaction atomically
    const updated = await db.$transaction(async (tx) => {
      // Update the request status
      const completed = await tx.inventoryRequest.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedBy: session.user.id,
          completedAt: new Date(),
        },
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          department: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          requestedByUser: { select: { id: true, name: true, email: true } },
        },
      })

      // Create an inventory transaction for the issued quantity
      await tx.inventoryTransaction.create({
        data: {
          productId: req.productId,
          type: 'ISSUED',
          quantity: completeQty,
          reference: id,
          remarks: `Fulfilled request ${id} — issued to ${req.employeeName}`,
        },
      })

      // Create an inventory issue record
      await tx.inventoryIssue.create({
        data: {
          productId: req.productId,
          departmentId: req.departmentId,
          projectId: req.projectId,
          issuedBy: session.user.id,
          employeeName: req.employeeName,
          quantity: completeQty,
          remarks: `Completed from request ${id}`,
        },
      })

      return completed
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'COMPLETED',
        entityType: 'InventoryRequest',
        entityId: id,
        details: `Completed request for ${completeQty} ${req.product.unit} of ${req.product.name} for ${req.employeeName}`,
      },
    })

    return Response.json({ data: updated })
  } catch (error) {
    console.error('PUT /api/requests/[id]/complete error:', error)
    return Response.json({ error: 'Failed to complete request' }, { status: 500 })
  }
}
