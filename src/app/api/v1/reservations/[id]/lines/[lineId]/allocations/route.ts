import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { allocateReservationLine, InventoryDomainError } from '@/lib/inventory/canonical-ledger'
import { hasPermission } from '@/lib/permissions'
import { allocationCreateSchema } from '@/lib/validation/reservation'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'reserve')) return forbiddenResponse()
  const parsed = allocationCreateSchema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'Invalid allocation', details: parsed.error.flatten() }, { status: 400 })
  const route = await params
  try {
    const entry = await allocateReservationLine({
      reservationId: route.id,
      reservationLineId: route.lineId,
      quantity: parsed.data.quantity,
      actorId: session.user.id,
      sourceId: `API-${randomUUID()}`,
      remarks: parsed.data.remarks ?? undefined,
    })
    return Response.json({ data: entry }, { status: 201 })
  } catch (error) {
    if (error instanceof InventoryDomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code.startsWith('INSUFFICIENT') ? 409 : 400
      return Response.json({ error: error.message, code: error.code }, { status })
    }
    console.error('POST reservation allocation error:', error)
    return Response.json({ error: 'Failed to allocate reservation stock' }, { status: 500 })
  }
}
