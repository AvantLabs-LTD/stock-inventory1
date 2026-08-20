import { Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'stock', 'view')) return forbiddenResponse()

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '25', 10) || 25))
  const componentId = searchParams.get('componentId') || undefined
  const where: Prisma.InventoryLedgerEntryWhereInput = componentId ? { componentId } : {}
  const [items, total] = await Promise.all([
    db.inventoryLedgerEntry.findMany({
      where,
      include: {
        component: { select: { id: true, code: true, title: true, unit: true } },
        actor: { select: { id: true, name: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.inventoryLedgerEntry.count({ where }),
  ])
  return Response.json({ data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
}
