import { Prisma, PurchaseRequestStatus } from '@prisma/client'
import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { createPurchaseRequest, PurchaseRequestDomainError } from '@/lib/inventory/purchase-request-service'
import { hasPermission } from '@/lib/permissions'
import { purchaseRequestCreateSchema } from '@/lib/validation/purchase-request'

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'view')) return forbiddenResponse()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  if (status && !Object.values(PurchaseRequestStatus).includes(status as PurchaseRequestStatus)) {
    return Response.json({ error: 'Invalid purchase request status' }, { status: 400 })
  }
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '25', 10) || 25))
  const where: Prisma.PurchaseRequestWhereInput = status ? { status: status as PurchaseRequestStatus } : {}
  const [items, total] = await Promise.all([
    db.purchaseRequest.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        lines: { include: { component: true, reservationLinks: true, receiptLines: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.purchaseRequest.count({ where }),
  ])
  return Response.json({ data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'create')) return forbiddenResponse()
  const parsed = purchaseRequestCreateSchema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'Invalid purchase request', details: parsed.error.flatten() }, { status: 400 })
  try {
    const created = await createPurchaseRequest({ actorId: session.user.id, idempotencyKey: request.headers.get('idempotency-key') ?? undefined, ...parsed.data })
    return Response.json({ data: created }, { status: 201 })
  } catch (error) {
    if (error instanceof PurchaseRequestDomainError) {
      return Response.json({ error: error.message }, { status: error.code === 'NOT_FOUND' ? 404 : 400 })
    }
    console.error('POST purchase request error:', error)
    return Response.json({ error: 'Failed to create purchase request' }, { status: 500 })
  }
}
