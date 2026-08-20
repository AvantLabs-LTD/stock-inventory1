import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { cancelReservationLine, InventoryDomainError } from '@/lib/inventory/canonical-ledger'
import { hasPermission } from '@/lib/permissions'

const quantity = z.union([z.number().positive(), z.string().trim().regex(/^\d+(\.\d+)?$/)])
const schema = z.object({ quantity, reason: z.string().trim().min(1).max(1000) })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'edit')) return forbiddenResponse()
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'Invalid cancellation', details: parsed.error.flatten() }, { status: 400 })
  const route = await params
  try {
    const entry = await cancelReservationLine({
      reservationId: route.id,
      reservationLineId: route.lineId,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      actorId: session.user.id,
      sourceId: request.headers.get('idempotency-key') || randomUUID(),
    })
    return Response.json({ data: entry }, { status: 201 })
  } catch (error) {
    if (error instanceof InventoryDomainError) return Response.json({ error: error.message, code: error.code }, { status: error.code === 'NOT_FOUND' ? 404 : 409 })
    console.error('POST reservation cancellation error:', error)
    return Response.json({ error: 'Failed to cancel reservation quantity' }, { status: 500 })
  }
}
