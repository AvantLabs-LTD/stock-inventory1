import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// PUT /api/requisitions/[id]/complete — Complete material requisition
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    // SUPER_ADMIN, INVENTORY_ADMIN, STORE_KEEPER can complete requisitions
    const canComplete = hasPermission(session.user.role, 'inventory_requests', 'edit')
    if (!canComplete) {
      return forbiddenResponse('No permission to complete inventory requests')
    }

    const { id } = await params

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

    if (requisition.status !== 'APPROVED' && requisition.status !== 'PARTIAL_APPROVED') {
      return Response.json(
        { error: `Cannot complete a requisition with status ${requisition.status}. Must be APPROVED or PARTIAL_APPROVED.` },
        { status: 400 }
      )
    }

    // Update requisition and create inventory issue records atomically
    const updated = await db.$transaction(async (tx) => {
      // Update the requisition status
      const completed = await tx.materialRequisition.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedBy: session.user.id,
          completedAt: new Date(),
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

      // For each item, create an InventoryIssue record
      for (const item of requisition.items) {
        if (item.issuedQty > 0) {
          await tx.inventoryIssue.create({
            data: {
              productId: item.productId,
              departmentId: requisition.departmentId,
              projectId: requisition.projectId,
              issuedBy: session.user.id,
              employeeName: requisition.employeeName,
              quantity: item.issuedQty,
              remarks: item.specDescription || `Completed from requisition ${requisition.requisitionNo}`,
            },
          })
        }
      }

      return completed
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'COMPLETED',
        entityType: 'MaterialRequisition',
        entityId: id,
        details: `Completed material requisition ${requisition.requisitionNo} with ${requisition.items.length} item(s) for ${requisition.employeeName}`,
      },
    })

    return Response.json({ data: updated })
  } catch (error) {
    console.error('PUT /api/requisitions/[id]/complete error:', error)
    return Response.json({ error: 'Failed to complete requisition' }, { status: 500 })
  }
}
