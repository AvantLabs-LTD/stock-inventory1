import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// DELETE /api/stock/received/[id] — Delete goods received (within 24h only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'receive')) {
      return forbiddenResponse('No permission to delete goods received')
    }

    const { id } = await params

    const goodsReceived = await db.goodsReceived.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true } },
      },
    })

    if (!goodsReceived) {
      return Response.json({ error: 'Goods received record not found' }, { status: 404 })
    }

    // Check within 24 hours
    const now = new Date()
    const createdAt = new Date(goodsReceived.createdAt)
    const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)

    if (hoursDiff > 24) {
      return Response.json(
        { error: 'Cannot delete goods received record after 24 hours. Use stock adjustment instead.' },
        { status: 400 }
      )
    }

    // Delete in transaction: remove the goods received and reverse the transaction
    await db.$transaction([
      db.inventoryTransaction.deleteMany({
        where: {
          productId: goodsReceived.productId,
          type: 'GOODS_RECEIVED',
          reference: goodsReceived.invoiceNumber,
          createdAt: goodsReceived.createdAt,
        },
      }),
      db.goodsReceived.delete({
        where: { id },
      }),
    ])

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'GOODS_RECEIVED_DELETED',
        entityType: 'GoodsReceived',
        entityId: id,
        details: `Deleted goods received record for ${goodsReceived.product.name}: qty=${goodsReceived.quantity}, cost=$${goodsReceived.unitCost}`,
      },
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/stock/received/[id] error:', error)
    return Response.json({ error: 'Failed to delete goods received record' }, { status: 500 })
  }
}
