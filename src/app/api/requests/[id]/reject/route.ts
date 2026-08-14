import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// PUT /api/requests/[id]/reject — Reject inventory request
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'inventory_requests', 'reject')) {
      return forbiddenResponse('No permission to reject inventory requests')
    }

    const { id } = await params
    const body = await request.json()
    const { remarks } = body

    // Find the request
    const req = await db.inventoryRequest.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true } },
      },
    })

    if (!req) {
      return Response.json({ error: 'Request not found' }, { status: 404 })
    }

    if (req.status !== 'PENDING') {
      return Response.json({ error: `Cannot reject a request with status ${req.status}` }, { status: 400 })
    }

    // Update the request
    const updated = await db.inventoryRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        remarks: remarks || null,
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
        action: 'REJECTED',
        entityType: 'InventoryRequest',
        entityId: id,
        details: `Rejected request for ${req.quantity} ${req.product.name}. Remarks: ${remarks || 'N/A'}`,
      },
    })

    return Response.json({ data: updated })
  } catch (error) {
    console.error('PUT /api/requests/[id]/reject error:', error)
    return Response.json({ error: 'Failed to reject request' }, { status: 500 })
  }
}
