import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { cancelReservation, InventoryDomainError } from '@/lib/inventory/canonical-ledger'
import { hasPermission } from '@/lib/permissions'

const schema = z.object({ reason: z.string().trim().min(1).max(1000) })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'edit')) return forbiddenResponse()
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'A cancellation reason is required', details: parsed.error.flatten() }, { status: 400 })
  try {
    const reservation = await cancelReservation({
      reservationId: (await params).id,
      actorId: session.user.id,
      sourceId: request.headers.get('idempotency-key') || randomUUID(),
      reason: parsed.data.reason,
    })
    return Response.json({ data: reservation })
  } catch (error) {
    if (error instanceof InventoryDomainError) return Response.json({ error: error.message, code: error.code }, { status: error.code === 'NOT_FOUND' ? 404 : 409 })
    console.error('POST reservation cancellation error:', error)
    return Response.json({ error: 'Failed to cancel reservation' }, { status: 500 })
  }
}
