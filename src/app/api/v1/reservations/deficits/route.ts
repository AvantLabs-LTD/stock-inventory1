import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { listReservationDeficits } from '@/lib/inventory/reservation-service'
import { hasPermission } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'view')) return forbiddenResponse()
  return Response.json({ data: await listReservationDeficits() })
}
