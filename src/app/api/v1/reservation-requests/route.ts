import { Prisma, ReservationRequestStatus } from '@prisma/client'
import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { createReservationRequest, ReservationDomainError } from '@/lib/inventory/reservation-service'
import { hasPermission } from '@/lib/permissions'
import { reservationRequestCreateSchema } from '@/lib/validation/reservation'

function domainResponse(error: ReservationDomainError) {
  const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400
  return Response.json({ error: error.message }, { status })
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'view')) return forbiddenResponse()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '25', 10) || 25))
  if (status && !Object.values(ReservationRequestStatus).includes(status as ReservationRequestStatus)) {
    return Response.json({ error: 'Invalid reservation request status' }, { status: 400 })
  }
  const where: Prisma.ReservationRequestWhereInput = status ? { status: status as ReservationRequestStatus } : {}
  const [items, total] = await Promise.all([
    db.reservationRequest.findMany({
      where,
      include: {
        project: true,
        department: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        items: { include: { component: true }, orderBy: { sortOrder: 'asc' } },
        reservation: { select: { id: true, reservationNo: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.reservationRequest.count({ where }),
  ])
  return Response.json({ data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'create')) return forbiddenResponse()
  const parsed = reservationRequestCreateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return Response.json({ error: 'Invalid reservation request', details: parsed.error.flatten() }, { status: 400 })
  }
  try {
    const created = await createReservationRequest({
      ...parsed.data,
      requestedById: session.user.id,
      requesterDepartmentId: session.user.departmentId,
      mayRequestForAnyDepartment: hasPermission(session.user.role, 'reservations', 'edit'),
    })
    return Response.json({ data: created }, { status: 201 })
  } catch (error) {
    if (error instanceof ReservationDomainError) return domainResponse(error)
    console.error('POST reservation request error:', error)
    return Response.json({ error: 'Failed to create reservation request' }, { status: 500 })
  }
}
