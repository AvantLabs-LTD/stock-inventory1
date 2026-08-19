import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { getReservationDetail, ReservationDomainError } from '@/lib/inventory/reservation-service'
import { hasPermission } from '@/lib/permissions'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'view')) return forbiddenResponse()
  try {
    return Response.json({ data: await getReservationDetail((await params).id) })
  } catch (error) {
    if (error instanceof ReservationDomainError) return Response.json({ error: error.message }, { status: 404 })
    console.error('GET reservation detail error:', error)
    return Response.json({ error: 'Failed to load reservation' }, { status: 500 })
  }
}
