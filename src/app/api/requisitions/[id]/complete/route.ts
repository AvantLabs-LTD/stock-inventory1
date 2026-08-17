import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// PUT /api/requisitions/[id]/complete — Complete material requisition
// This issues items and auto-subtracts from InventoryItem stock
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
        project: { select: { name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, unit: true, variantName: true, parentProductId: true } },
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

    // Fetch parent product names for matching with InventoryItem
    const parentProductIds = requisition.items
      .map((item) => item.product.parentProductId || item.productId)
      .filter((v, i, a) => a.indexOf(v) === i)
    const parentProducts = await db.product.findMany({
      where: { id: { in: parentProductIds } },
      select: { id: true, name: true },
    })
    const parentProductMap = new Map(parentProducts.map((p) => [p.id, p.name]))

    // Update requisition, create inventory issue records, and subtract stock atomically
    const updated = await db.$transaction(async (tx) => {
      // Update the requisition status to CLOSED
      const completed = await tx.materialRequisition.update({
        where: { id },
        data: {
          status: 'CLOSED',
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

      // For each item, create InventoryIssue and subtract from InventoryItem stock
      for (const item of requisition.items) {
        if (item.issuedQty > 0) {
          // Create InventoryIssue record
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

          // Subtract from InventoryItem stock
          const parentName = parentProductMap.get(item.product.parentProductId || item.productId) || item.product.name
          const specName = item.product.variantName || item.specDescription || ''

          const invItem = await tx.inventoryItem.findFirst({
            where: {
              itemName: parentName,
              specification: specName,
            },
          })

          if (invItem) {
            const previousStock = invItem.quantity
            const newStock = Math.max(0, previousStock - item.issuedQty)
            await tx.inventoryItem.update({
              where: { id: invItem.id },
              data: {
                quantity: newStock,
                issuedQty: invItem.issuedQty + item.issuedQty,
                lastTransactionAt: new Date(),
              },
            })

            // Create StockMovement audit record
            await tx.stockMovement.create({
              data: {
                inventoryItemId: invItem.id,
                action: 'ISSUE',
                reason: 'Issue',
                quantity: item.issuedQty,
                previousStock,
                newStock,
                remarks: `Issued to ${requisition.requisitionNo} — ${requisition.project?.name || 'N/A'}`,
                userId: session.user.id,
                userName: session.user.name,
              },
            })
          }
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
        details: `Completed & closed material requisition ${requisition.requisitionNo} with ${requisition.items.length} item(s) for ${requisition.employeeName}. Stock deducted automatically.`,
      },
    })

    return Response.json({ data: updated })
  } catch (error) {
    console.error('PUT /api/requisitions/[id]/complete error:', error)
    return Response.json({ error: 'Failed to complete requisition' }, { status: 500 })
  }
}
