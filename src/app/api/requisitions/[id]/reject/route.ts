import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// PUT /api/requisitions/[id]/reject — Reject material requisition
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

    // Find the requisition
    const requisition = await db.materialRequisition.findUnique({
      where: { id },
    })

    if (!requisition) {
      return Response.json({ error: 'Requisition not found' }, { status: 404 })
    }

    if (requisition.status !== 'PENDING') {
      return Response.json({ error: `Cannot reject a requisition with status ${requisition.status}` }, { status: 400 })
    }

    // Update the requisition
    const updated = await db.materialRequisition.update({
      where: { id },
      data: {
        status: 'REJECTED',
        remarks: remarks || null,
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

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'REJECTED',
        entityType: 'MaterialRequisition',
        entityId: id,
        details: `Rejected material requisition ${requisition.requisitionNo}. Remarks: ${remarks || 'N/A'}`,
      },
    })

    return Response.json({ data: updated })
  } catch (error) {
    console.error('PUT /api/requisitions/[id]/reject error:', error)
    return Response.json({ error: 'Failed to reject requisition' }, { status: 500 })
  }
}
