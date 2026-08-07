import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/inventory-items/specs?itemName=... — Get specifications for a given item name
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view inventory items')
    }

    const { searchParams } = new URL(request.url)
    const itemName = searchParams.get('itemName')

    if (!itemName) {
      return Response.json({ error: 'itemName query parameter is required' }, { status: 400 })
    }

    const items = await db.inventoryItem.findMany({
      where: {
        itemName,
        status: 'ACTIVE',
      },
      select: {
        specification: true,
      },
      distinct: ['specification'],
      orderBy: { specification: 'asc' },
    })

    return Response.json({
      itemName,
      specifications: items.map((item) => item.specification),
    })
  } catch (error) {
    console.error('GET /api/inventory-items/specs error:', error)
    return Response.json({ error: 'Failed to fetch specifications' }, { status: 500 })
  }
}
