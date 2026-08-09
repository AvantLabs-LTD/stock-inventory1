import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/inventory-items/[id]/movements — Stock movement history
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view stock movements')
    }

    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Verify item exists
    const item = await db.inventoryItem.findUnique({
      where: { id },
      select: { id: true, itemName: true, specification: true, warehouse: true },
    })

    if (!item) {
      return Response.json({ error: 'Inventory item not found' }, { status: 404 })
    }

    const [movements, total] = await Promise.all([
      db.stockMovement.findMany({
        where: { inventoryItemId: id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.stockMovement.count({
        where: { inventoryItemId: id },
      }),
    ])

    return Response.json({
      item,
      movements,
      pagination: { total, limit, offset },
    })
  } catch (error) {
    console.error('GET /api/inventory-items/[id]/movements error:', error)
    return Response.json({ error: 'Failed to fetch stock movements' }, { status: 500 })
  }
}
