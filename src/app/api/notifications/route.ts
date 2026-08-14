import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse } from '@/lib/auth-middleware'
import { ROLES } from '@/lib/permissions'

interface Notification {
  id: string
  type: string
  message: string
  date: string
  read: boolean
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    const notifications: Notification[] = []
    const { user } = session

    // Admin notifications: pending requests count, low stock count, out of stock count
    if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.INVENTORY_ADMIN) {
      // Pending requests
      const pendingCount = await db.inventoryRequest.count({
        where: { status: 'PENDING' },
      })
      if (pendingCount > 0) {
        notifications.push({
          id: `pending-requests-${pendingCount}`,
          type: 'pending_requests',
          message: `${pendingCount} pending inventory request${pendingCount > 1 ? 's' : ''} awaiting approval`,
          date: new Date().toISOString(),
          read: false,
        })
      }

      // Low stock count (products below minimum stock)
      const products = await db.product.findMany({
        where: { status: 'ACTIVE', minimumStock: { gt: 0 } },
        select: { id: true, name: true, minimumStock: true },
      })

      let lowStockCount = 0
      let outOfStockCount = 0

      for (const product of products) {
        const transactions = await db.inventoryTransaction.findMany({
          where: { productId: product.id },
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
          where: { productId: product.id, status: 'ACTIVE' },
          _sum: { quantity: true },
        })
        const reservedStock = reservedResult._sum.quantity || 0

        const available = totalIn - totalOut - reservedStock

        if (available <= 0) {
          outOfStockCount++
        } else if (available < product.minimumStock) {
          lowStockCount++
        }
      }

      if (outOfStockCount > 0) {
        notifications.push({
          id: `out-of-stock-${outOfStockCount}`,
          type: 'out_of_stock',
          message: `${outOfStockCount} product${outOfStockCount > 1 ? 's are' : ' is'} out of stock`,
          date: new Date().toISOString(),
          read: false,
        })
      }

      if (lowStockCount > 0) {
        notifications.push({
          id: `low-stock-${lowStockCount}`,
          type: 'low_stock',
          message: `${lowStockCount} product${lowStockCount > 1 ? 's are' : ' is'} below minimum stock level`,
          date: new Date().toISOString(),
          read: false,
        })
      }
    }

    // Department user notifications: their approved/rejected requests
    if (user.role === ROLES.DEPARTMENT_USER) {
      const recentRequests = await db.inventoryRequest.findMany({
        where: {
          requestedBy: user.id,
          status: { in: ['APPROVED', 'REJECTED', 'PARTIAL_APPROVED'] },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: {
          product: { select: { name: true } },
        },
      })

      for (const req of recentRequests) {
        const statusLabel =
          req.status === 'APPROVED'
            ? 'approved'
            : req.status === 'REJECTED'
              ? 'rejected'
              : 'partially approved'

        notifications.push({
          id: `request-${req.id}`,
          type: req.status === 'REJECTED' ? 'request_rejected' : 'request_approved',
          message: `Your request for ${req.product.name} has been ${statusLabel}`,
          date: req.updatedAt.toISOString(),
          read: false,
        })
      }
    }

    // Sort newest first
    notifications.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return Response.json({ data: notifications })
  } catch (error) {
    console.error('GET /api/notifications error:', error)
    return Response.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}
