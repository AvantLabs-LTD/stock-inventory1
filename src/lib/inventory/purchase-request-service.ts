import { randomUUID } from 'node:crypto'
import { Prisma, PurchaseRequestStatus, PurchaseRequestType } from '@prisma/client'
import { db } from '@/lib/db'

const ZERO = new Prisma.Decimal(0)

export class PurchaseRequestDomainError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'INVALID_STATE' | 'INVALID_QUANTITY' | 'FORBIDDEN'
  ) {
    super(message)
    this.name = 'PurchaseRequestDomainError'
  }
}

function generatedNo() {
  return `PR-${randomUUID().slice(0, 8).toUpperCase()}`
}

type Candidate = {
  reservationLineId: string
  unprocuredDeficit: Prisma.Decimal
}

async function linkOutstandingReservations(
  tx: Prisma.TransactionClient,
  purchaseRequestLineId: string,
  componentId: string,
  purchaseQuantity: Prisma.Decimal
) {
  const candidates = await tx.$queryRaw<Candidate[]>`
    SELECT
      "reservationLineId",
      "unprocuredDeficit"
    FROM "reservation_line_supply"
    WHERE "componentId" = ${componentId}
      AND "unprocuredDeficit" > 0
    ORDER BY "reservationCreatedAt", "reservationNo", "reservationLineId"
  `

  let remainingPurchase = purchaseQuantity
  for (const candidate of candidates) {
    const linkedQuantity = Prisma.Decimal.min(candidate.unprocuredDeficit, remainingPurchase)
    if (!linkedQuantity.isPositive()) continue
    await tx.purchaseReservationLink.create({
      data: { purchaseRequestLineId, reservationLineId: candidate.reservationLineId, quantity: linkedQuantity },
    })
    remainingPurchase = remainingPurchase.minus(linkedQuantity)
    if (!remainingPurchase.isPositive()) break
  }
}

export async function createPurchaseRequest(input: {
  actorId: string
  idempotencyKey?: string
  remarks?: string | null
  lines: Array<{
    componentId: string
    type: PurchaseRequestType
    quantity: Prisma.Decimal | number | string
    remarks?: string | null
  }>
}) {
  return db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.purchaseRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
      if (existing) return getPurchaseRequestWithin(tx, existing.id)
    }
    const request = await tx.purchaseRequest.create({
      data: { requestNo: generatedNo(), idempotencyKey: input.idempotencyKey, createdById: input.actorId, remarks: input.remarks?.trim() || null },
    })
    for (const item of input.lines) {
      const quantity = new Prisma.Decimal(item.quantity)
      if (!quantity.isPositive()) throw new PurchaseRequestDomainError('Purchase quantity must be positive', 'INVALID_QUANTITY')
      const component = await tx.component.findFirst({ where: { id: item.componentId, status: { not: 'ARCHIVED' } } })
      if (!component) throw new PurchaseRequestDomainError('Component was not found', 'NOT_FOUND')
      const line = await tx.purchaseRequestLine.create({
        data: {
          purchaseRequestId: request.id,
          componentId: component.id,
          type: item.type,
          quantity,
          remarks: item.remarks?.trim() || null,
        },
      })
      await linkOutstandingReservations(tx, line.id, component.id, quantity)
    }
    return getPurchaseRequestWithin(tx, request.id)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

function getPurchaseRequestWithin(tx: Prisma.TransactionClient, id: string) {
  return tx.purchaseRequest.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      lines: {
        include: {
          component: { include: { balance: true } },
          reservationLinks: { include: { reservationLine: { include: { reservation: true } } } },
          receiptLines: true,
        },
      },
      receipts: { include: { lines: true, attachments: { select: { id: true, fileName: true, kind: true, sizeBytes: true } } } },
      attachments: { select: { id: true, fileName: true, contentType: true, sizeBytes: true, kind: true, createdAt: true } },
    },
  })
}

export async function getPurchaseRequest(id: string) {
  const request = await getPurchaseRequestWithin(db, id)
  if (!request) throw new PurchaseRequestDomainError('Purchase request was not found', 'NOT_FOUND')
  return {
    ...request,
    lines: request.lines.map((line) => ({
      ...line,
      receivedQuantity: line.receiptLines.reduce((sum, receipt) => sum.plus(receipt.quantity), ZERO),
    })),
  }
}

export async function updatePurchaseRequestDetails(input: {
  id: string
  provider?: string | null
  trackingNumber?: string | null
  boxNumber?: string | null
  remarks?: string | null
}) {
  const request = await db.purchaseRequest.findUnique({ where: { id: input.id } })
  if (!request) throw new PurchaseRequestDomainError('Purchase request was not found', 'NOT_FOUND')
  if (request.status === PurchaseRequestStatus.RECEIVED_IN_STORE) {
    throw new PurchaseRequestDomainError('A completed purchase request cannot be edited', 'INVALID_STATE')
  }
  const clean = (value: string | null | undefined) => value === undefined ? undefined : value?.trim() || null
  await db.purchaseRequest.update({
    where: { id: input.id },
    data: {
      provider: clean(input.provider),
      trackingNumber: clean(input.trackingNumber),
      boxNumber: clean(input.boxNumber),
      remarks: clean(input.remarks),
    },
  })
  return getPurchaseRequest(input.id)
}

export async function transitionPurchaseRequest(input: {
  id: string
  target: PurchaseRequestStatus
  actorId: string
  actorMayOrder: boolean
  actorMayManage: boolean
}) {
  return db.$transaction(async (tx) => {
    const request = await tx.purchaseRequest.findUnique({ where: { id: input.id }, include: { lines: true } })
    if (!request) throw new PurchaseRequestDomainError('Purchase request was not found', 'NOT_FOUND')
    const allowed =
      (request.status === PurchaseRequestStatus.BACKLOG && input.target === PurchaseRequestStatus.PENDING_ORDER_APPROVAL && input.actorMayManage)
      || (request.status === PurchaseRequestStatus.PENDING_ORDER_APPROVAL && input.target === PurchaseRequestStatus.ORDERED && input.actorMayOrder)
      || (request.status === PurchaseRequestStatus.ORDERED && input.target === PurchaseRequestStatus.SHIPPED && input.actorMayManage)
    if (!allowed) throw new PurchaseRequestDomainError(`Cannot move ${request.status} to ${input.target}`, 'FORBIDDEN')
    if (request.lines.length === 0) throw new PurchaseRequestDomainError('A purchase request requires at least one line', 'INVALID_STATE')
    const now = new Date()
    await tx.purchaseRequest.update({
      where: { id: request.id },
      data: {
        status: input.target,
        submittedAt: input.target === PurchaseRequestStatus.PENDING_ORDER_APPROVAL ? now : undefined,
        approvedById: input.target === PurchaseRequestStatus.ORDERED ? input.actorId : undefined,
        approvedAt: input.target === PurchaseRequestStatus.ORDERED ? now : undefined,
        orderedAt: input.target === PurchaseRequestStatus.ORDERED ? now : undefined,
        shippedAt: input.target === PurchaseRequestStatus.SHIPPED ? now : undefined,
      },
    })
    return getPurchaseRequestWithin(tx, request.id)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function updatePurchaseReservationLink(input: { requestId: string; linkId: string; quantity?: Prisma.Decimal | number | string }) {
  return db.$transaction(async (tx) => {
    const link = await tx.purchaseReservationLink.findFirst({
      where: { id: input.linkId, purchaseRequestLine: { purchaseRequestId: input.requestId } },
      include: { purchaseRequestLine: { include: { purchaseRequest: true } } },
    })
    if (!link) throw new PurchaseRequestDomainError('Reservation link was not found', 'NOT_FOUND')
    if (link.purchaseRequestLine.purchaseRequest.status !== PurchaseRequestStatus.BACKLOG) {
      throw new PurchaseRequestDomainError('Reservation links can only be changed while the request is in backlog', 'INVALID_STATE')
    }
    if (input.quantity === undefined) return tx.purchaseReservationLink.delete({ where: { id: link.id } })
    const quantity = new Prisma.Decimal(input.quantity)
    if (!quantity.isPositive()) {
      throw new PurchaseRequestDomainError('Link quantity must be positive', 'INVALID_QUANTITY')
    }
    const [otherLinks, demand] = await Promise.all([
      tx.purchaseReservationLink.aggregate({
        where: { purchaseRequestLineId: link.purchaseRequestLineId, id: { not: link.id } },
        _sum: { quantity: true },
      }),
      tx.$queryRaw<Array<{ physicalStockDeficit: Prisma.Decimal }>>`
        SELECT "physicalStockDeficit"
        FROM "reservation_line_supply"
        WHERE "reservationLineId" = ${link.reservationLineId}
      `,
    ])
    const otherLineCoverage = otherLinks._sum.quantity ?? ZERO
    if (otherLineCoverage.plus(quantity).greaterThan(link.purchaseRequestLine.quantity)) {
      throw new PurchaseRequestDomainError('Reservation links cannot exceed the purchase line quantity', 'INVALID_QUANTITY')
    }
    const otherActiveReservationCoverage = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>`
      SELECT COALESCE(SUM(other."quantity"), 0)::DECIMAL(18, 6) AS quantity
      FROM "purchase_reservation_links" other
      JOIN "purchase_request_lines" purchase_line ON purchase_line."id" = other."purchaseRequestLineId"
      JOIN "purchase_requests" request ON request."id" = purchase_line."purchaseRequestId"
      WHERE other."reservationLineId" = ${link.reservationLineId}
        AND other."id" <> ${link.id}
        AND request."status" <> 'RECEIVED_IN_STORE'
    `
    const maximumNeeded = Prisma.Decimal.max(
      (demand[0]?.physicalStockDeficit ?? ZERO).minus(otherActiveReservationCoverage[0]?.quantity ?? ZERO),
      ZERO
    )
    if (quantity.greaterThan(maximumNeeded)) {
      throw new PurchaseRequestDomainError('Link quantity exceeds the reservation line physical deficit', 'INVALID_QUANTITY')
    }
    return tx.purchaseReservationLink.update({ where: { id: link.id }, data: { quantity } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
