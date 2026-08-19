import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'view')) return forbiddenResponse()
  const { id } = await params
  const item = await db.reservationRequest.findUnique({
    where: { id },
    include: {
      project: true,
      department: true,
      requestedBy: { select: { id: true, name: true, email: true } },
      items: { include: { component: true, projectComponent: true }, orderBy: { sortOrder: 'asc' } },
      reservation: { select: { id: true, reservationNo: true, status: true } },
    },
  })
  return item ? Response.json({ data: item }) : Response.json({ error: 'Reservation request was not found' }, { status: 404 })
}
