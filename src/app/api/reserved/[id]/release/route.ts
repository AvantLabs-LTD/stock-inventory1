import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// POST /api/reserved/[id]/release — Release reservation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reserved_inventory', 'release')) {
      return forbiddenResponse('No permission to release reservations')
    }

    const { id } = await params

    // Find the reservation
    const reservation = await db.reservedInventory.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, code: true, unit: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    })

    if (!reservation) {
      return Response.json({ error: 'Reservation not found' }, { status: 404 })
    }

    if (reservation.status === 'RELEASED') {
      return Response.json({ error: 'This reservation has already been released' }, { status: 400 })
    }

    // Release the reservation
    const released = await db.reservedInventory.update({
      where: { id },
      data: {
        status: 'RELEASED',
        releasedBy: session.user.id,
        releasedAt: new Date(),
      },
      include: {
        product: { select: { id: true, name: true, code: true, unit: true } },
        project: { select: { id: true, name: true, code: true } },
        reservedByUser: { select: { id: true, name: true, email: true } },
        releasedByUser: { select: { id: true, name: true } },
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'RELEASED',
        entityType: 'ReservedInventory',
        entityId: id,
        details: `Released reservation of ${reservation.quantity} ${reservation.product.unit} of ${reservation.product.name} for ${reservation.project.name}`,
      },
    })

    return Response.json(released)
  } catch (error) {
    console.error('POST /api/reserved/[id]/release error:', error)
    return Response.json({ error: 'Failed to release reservation' }, { status: 500 })
  }
}
