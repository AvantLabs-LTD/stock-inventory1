import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { InventoryDomainError, releaseReservationLine } from '@/lib/inventory/canonical-ledger'
import { hasPermission } from '@/lib/permissions'
import { allocationCreateSchema } from '@/lib/validation/reservation'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'release')) return forbiddenResponse()
  const parsed = allocationCreateSchema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'Invalid allocation release', details: parsed.error.flatten() }, { status: 400 })
  const route = await params
  try {
    const entry = await releaseReservationLine({
      reservationId: route.id,
      reservationLineId: route.lineId,
      quantity: parsed.data.quantity,
      actorId: session.user.id,
      sourceId: request.headers.get('idempotency-key') || randomUUID(),
      remarks: parsed.data.remarks ?? undefined,
    })
    return Response.json({ data: entry }, { status: 201 })
  } catch (error) {
    if (error instanceof InventoryDomainError) return Response.json({ error: error.message, code: error.code }, { status: error.code === 'NOT_FOUND' ? 404 : 409 })
    console.error('POST reservation release error:', error)
    return Response.json({ error: 'Failed to release reservation allocation' }, { status: 500 })
  }
}
