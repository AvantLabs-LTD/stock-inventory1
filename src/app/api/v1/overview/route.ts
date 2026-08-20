import { ReservationStatus, InventoryLedgerEntryType, Prisma, PurchaseRequestStatus, ReservationRequestStatus } from '@prisma/client'
import { NextRequest } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth-middleware'
import { db } from '@/lib/db'

type DeficitTotals = {
  physicalDeficit: string
  unprocuredDeficit: string
  affectedLines: bigint
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    components,
    balances,
    openCycles,
    submittedRequests,
    pendingApproval,
    recentMovements,
    movementTotals,
    deficitRows,
  ] = await Promise.all([
    db.component.count({ where: { status: 'ACTIVE' } }),
    db.componentBalance.aggregate({ _sum: { onHand: true, allocated: true } }),
    db.reservation.count({ where: { status: { in: [ReservationStatus.PENDING, ReservationStatus.IN_PROGRESS] } } }),
    db.reservationRequest.count({ where: { status: ReservationRequestStatus.SUBMITTED } }),
    db.purchaseRequest.count({ where: { status: PurchaseRequestStatus.PENDING_ORDER_APPROVAL } }),
    db.inventoryLedgerEntry.findMany({
      include: {
        component: { select: { code: true, title: true, unit: true } },
        actor: { select: { name: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 8,
    }),
    db.inventoryLedgerEntry.groupBy({
      by: ['type'],
      where: { occurredAt: { gte: today } },
      _sum: { quantity: true },
    }),
    db.$queryRaw<DeficitTotals[]>`
      SELECT
        COALESCE(SUM("physicalStockDeficit"), 0)::text AS "physicalDeficit",
        COALESCE(SUM("unprocuredDeficit"), 0)::text AS "unprocuredDeficit",
        COUNT(*) FILTER (WHERE "physicalStockDeficit" > 0) AS "affectedLines"
      FROM reservation_line_supply
    `,
  ])

  const byType = new Map(movementTotals.map((row) => [row.type, row._sum.quantity?.toString() ?? '0']))
  const receivedToday = byType.get(InventoryLedgerEntryType.RECEIVE) ?? '0'
  const issuedToday = byType.get(InventoryLedgerEntryType.ISSUE) ?? '0'
  const returnedToday = byType.get(InventoryLedgerEntryType.RETURN) ?? '0'
  const deficit = deficitRows[0]
  const freeStock = new Prisma.Decimal(balances._sum.onHand?.toString() ?? '0')
    .minus(new Prisma.Decimal(balances._sum.allocated?.toString() ?? '0'))

  return Response.json({
    data: {
      components,
      onHand: balances._sum.onHand?.toString() ?? '0',
      allocated: balances._sum.allocated?.toString() ?? '0',
      freeStock: freeStock.toString(),
      openCycles,
      submittedRequests,
      pendingApproval,
      physicalDeficit: deficit?.physicalDeficit ?? '0',
      unprocuredDeficit: deficit?.unprocuredDeficit ?? '0',
      affectedLines: deficit ? Number(deficit.affectedLines) : 0,
      receivedToday,
      issuedToday,
      returnedToday,
      recentMovements,
    },
  })
}
