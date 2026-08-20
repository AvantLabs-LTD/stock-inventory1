import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { convertReservationRequest, ReservationDomainError } from '@/lib/inventory/reservation-service'
import { hasPermission } from '@/lib/permissions'
import { reservationRequestConvertSchema } from '@/lib/validation/reservation'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'approve')) return forbiddenResponse()
  const { id } = await params
  const parsed = reservationRequestConvertSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid conversion inputs', details: parsed.error.flatten() }, { status: 400 })
  }
  try {
    const reservation = await convertReservationRequest({
      requestId: id,
      actorId: session.user.id,
      ...parsed.data,
    })
    return Response.json({ data: reservation }, { status: 201 })
  } catch (error) {
    if (error instanceof ReservationDomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'UNRECONCILED' ? 422 : 409
      return Response.json({ error: error.message }, { status })
    }
    console.error('POST reservation conversion error:', error)
    return Response.json({ error: 'Failed to convert reservation request' }, { status: 500 })
  }
}
