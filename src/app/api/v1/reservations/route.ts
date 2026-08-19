import { CanonicalReservationStatus, Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'view')) return forbiddenResponse()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  if (status && !Object.values(CanonicalReservationStatus).includes(status as CanonicalReservationStatus)) {
    return Response.json({ error: 'Invalid reservation status' }, { status: 400 })
  }
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '25', 10) || 25))
  const where: Prisma.ReservationWhereInput = status ? { status: status as CanonicalReservationStatus } : {}
  const [items, total] = await Promise.all([
    db.reservation.findMany({
      where,
      include: { project: true, department: true, request: { include: { requestedBy: { select: { id: true, name: true } } } }, _count: { select: { lines: true, issues: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.reservation.count({ where }),
  ])
  return Response.json({ data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
}
