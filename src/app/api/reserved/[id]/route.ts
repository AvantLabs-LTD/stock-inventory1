import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/reserved/[id] — Single reservation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reserved_inventory', 'view')) {
      return forbiddenResponse('No permission to view reservations')
    }

    const { id } = await params

    const reservation = await db.reservedInventory.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, code: true, unit: true, sku: true } },
        project: { select: { id: true, name: true, code: true, status: true } },
        reservedByUser: { select: { id: true, name: true, email: true } },
        releasedByUser: { select: { id: true, name: true } },
      },
    })

    if (!reservation) {
      return Response.json({ error: 'Reservation not found' }, { status: 404 })
    }

    return Response.json(reservation)
  } catch (error) {
    console.error('GET /api/reserved/[id] error:', error)
    return Response.json({ error: 'Failed to fetch reservation' }, { status: 500 })
  }
}
