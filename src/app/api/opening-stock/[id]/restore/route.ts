import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── PATCH /api/opening-stock/:id/restore — Restore soft-deleted record ────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can restore opening stock')
    }

    const { id } = await params

    const existing = await db.openingStock.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true } },
      },
    })

    if (!existing) {
      return Response.json({ error: 'Opening stock entry not found' }, { status: 404 })
    }

    if (existing.status !== 'DELETED') {
      return Response.json({ error: 'Entry is not deleted. No need to restore.' }, { status: 400 })
    }

    await db.$transaction(async (tx) => {
      // Restore
      await tx.openingStock.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          deletedAt: null,
          deletedBy: null,
        },
      })

      // Create ledger entry
      await tx.stockLedger.create({
        data: {
          openingStockId: id,
          transactionType: 'ADJUSTMENT_IN',
          quantity: existing.currentStock,
          oldStock: 0,
          newStock: existing.currentStock,
          userId: session.user.id,
          warehouse: existing.warehouse,
          remarks: `Restored by ${session.user.name}`,
        },
      })
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'OPENING_STOCK_RESTORED',
        entityType: 'OpeningStock',
        entityId: id,
        details: `Restored opening stock for ${existing.product.name} (qty=${existing.currentStock})`,
      },
    })

    return Response.json({ success: true, message: 'Opening stock entry restored' })
  } catch (error) {
    console.error('PATCH /api/opening-stock/:id/restore error:', error)
    return Response.json({ error: 'Failed to restore opening stock' }, { status: 500 })
  }
}
