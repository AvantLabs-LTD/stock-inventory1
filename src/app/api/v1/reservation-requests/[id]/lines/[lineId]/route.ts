import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { reconcileReservationRequestLine, ReservationDomainError } from '@/lib/inventory/reservation-service'
import { hasPermission } from '@/lib/permissions'
import { reservationLineReconciliationSchema } from '@/lib/validation/reservation'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'edit')) return forbiddenResponse()
  const parsed = reservationLineReconciliationSchema.safeParse(await request.json())
  if (!parsed.success) {
    return Response.json({ error: 'Choose an existing component or create a new one', details: parsed.error.flatten() }, { status: 400 })
  }
  const route = await params
  try {
    const line = await reconcileReservationRequestLine({
      requestId: route.id,
      lineId: route.lineId,
      actorId: session.user.id,
      componentId: parsed.data.componentId,
      createComponent: parsed.data.createComponent,
    })
    return Response.json({ data: line })
  } catch (error) {
    if (error instanceof ReservationDomainError) {
      return Response.json({ error: error.message }, { status: error.code === 'NOT_FOUND' ? 404 : 409 })
    }
    console.error('PATCH reservation request reconciliation error:', error)
    return Response.json({ error: 'Failed to reconcile reservation request line' }, { status: 500 })
  }
}
