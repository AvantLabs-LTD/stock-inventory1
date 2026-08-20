import {
  AllocationEntryType,
  ReservationStatus,
  InventoryLedgerEntryType,
  Prisma,
} from '@prisma/client'
import { db } from '@/lib/db'

export type QuantityInput = Prisma.Decimal | number | string

export class InventoryDomainError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_QUANTITY'
      | 'INSUFFICIENT_STOCK'
      | 'INSUFFICIENT_ALLOCATION'
      | 'OVER_FULFILLMENT'
      | 'INVALID_STATE'
      | 'NOT_FOUND'
  ) {
    super(message)
    this.name = 'InventoryDomainError'
  }
}

const ZERO = new Prisma.Decimal(0)

function decimal(value: QuantityInput): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

function positive(value: QuantityInput, field = 'quantity'): Prisma.Decimal {
  const result = decimal(value)
  if (!result.isPositive()) {
    throw new InventoryDomainError(`${field} must be greater than zero`, 'INVALID_QUANTITY')
  }
  return result
}

async function lockBalance(tx: Prisma.TransactionClient, componentId: string) {
  await tx.componentBalance.upsert({
    where: { componentId },
    create: { componentId },
    update: {},
  })

  const rows = await tx.$queryRaw<Array<{ onHand: Prisma.Decimal; allocated: Prisma.Decimal }>>`
    SELECT "onHand", "allocated"
      FROM "component_balances"
     WHERE "componentId" = ${componentId}
     FOR UPDATE
  `

  const balance = rows[0]
  if (!balance) throw new InventoryDomainError('Component balance was not found', 'NOT_FOUND')
  return balance
}

async function postMovement(
  tx: Prisma.TransactionClient,
  input: {
    componentId: string
    type: InventoryLedgerEntryType
    quantity: Prisma.Decimal
    sourceType: string
    sourceId: string
    sourceLineId: string
    actorId: string
    remarks?: string | null
    occurredAt?: Date
  }
) {
  const existing = await tx.inventoryLedgerEntry.findUnique({
    where: {
      sourceType_sourceLineId: {
        sourceType: input.sourceType,
        sourceLineId: input.sourceLineId,
      },
    },
  })
  if (existing) return existing

  const balance = await lockBalance(tx, input.componentId)
  const onHandAfter = balance.onHand.plus(input.quantity)
  if (onHandAfter.isNegative()) {
    throw new InventoryDomainError('The transaction would make stock negative', 'INSUFFICIENT_STOCK')
  }
  if (balance.allocated.greaterThan(onHandAfter)) {
    throw new InventoryDomainError('The transaction would consume stock allocated to reservations', 'INSUFFICIENT_STOCK')
  }

  await tx.componentBalance.update({
    where: { componentId: input.componentId },
    data: {
      onHand: onHandAfter,
      version: { increment: 1 },
    },
  })

  return tx.inventoryLedgerEntry.create({
    data: {
      componentId: input.componentId,
      type: input.type,
      quantity: input.quantity,
      onHandAfter,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceLineId: input.sourceLineId,
      actorId: input.actorId,
      remarks: input.remarks,
      occurredAt: input.occurredAt,
    },
  })
}

async function reservationLineTotals(tx: Prisma.TransactionClient, reservationLineId: string) {
  const rows = await tx.$queryRaw<Array<{
    requiredQuantity: Prisma.Decimal
    cancelledQuantity: Prisma.Decimal
    allocatedQuantity: Prisma.Decimal
    netIssuedQuantity: Prisma.Decimal
  }>>`
    SELECT "requiredQuantity", "cancelledQuantity", "allocatedQuantity", "netIssuedQuantity"
    FROM "reservation_line_requirements"
    WHERE "reservationLineId" = ${reservationLineId}
  `
  if (!rows[0]) throw new InventoryDomainError('Reservation line requirement was not found', 'NOT_FOUND')
  return {
    target: rows[0].requiredQuantity,
    cancelled: rows[0].cancelledQuantity,
    allocated: rows[0].allocatedQuantity,
    issued: rows[0].netIssuedQuantity,
  }
}

async function refreshReservationStatus(tx: Prisma.TransactionClient, reservationId: string) {
  const reservation = await tx.reservation.findUnique({
    where: { id: reservationId },
    include: {
      lines: { select: { id: true } },
    },
  })
  if (!reservation) throw new InventoryDomainError('Reservation was not found', 'NOT_FOUND')
  if (reservation.status === ReservationStatus.CANCELLED) return reservation

  const requirements = await tx.$queryRaw<Array<{
    remainingQuantity: Prisma.Decimal
    netIssuedQuantity: Prisma.Decimal
  }>>`
    SELECT "remainingQuantity", "netIssuedQuantity"
    FROM "reservation_line_requirements"
    WHERE "reservationId" = ${reservationId}
  `
  const allFulfilled = requirements.length > 0 && requirements.every((line) => line.remainingQuantity.isZero())
  const anyIssued = requirements.some((line) => line.netIssuedQuantity.isPositive())

  let status: ReservationStatus
  if (allFulfilled) status = ReservationStatus.CLOSED
  else if (anyIssued) status = ReservationStatus.IN_PROGRESS
  else status = ReservationStatus.PENDING

  return tx.reservation.update({
    where: { id: reservationId },
    data: {
      status,
      closedAt: status === ReservationStatus.CLOSED ? new Date() : null,
    },
  })
}

export async function allocateReservationLine(input: {
  reservationId?: string
  reservationLineId: string
  quantity: QuantityInput
  actorId: string
  sourceId: string
  remarks?: string
}) {
  const quantity = positive(input.quantity)

  return db.$transaction(async (tx) => {
    const line = await tx.reservationLine.findUnique({ where: { id: input.reservationLineId } })
    if (!line) throw new InventoryDomainError('Reservation line was not found', 'NOT_FOUND')
    if (input.reservationId && line.reservationId !== input.reservationId) {
      throw new InventoryDomainError('Reservation line does not belong to this reservation', 'INVALID_STATE')
    }

    const totals = await reservationLineTotals(tx, line.id)
    const target = totals.target.minus(totals.cancelled)
    const remainingDemand = target.minus(totals.issued).minus(totals.allocated)
    if (quantity.greaterThan(remainingDemand)) {
      throw new InventoryDomainError('Allocation exceeds the outstanding reservation quantity', 'OVER_FULFILLMENT')
    }

    const balance = await lockBalance(tx, line.componentId)
    const available = balance.onHand.minus(balance.allocated)
    if (quantity.greaterThan(available)) {
      throw new InventoryDomainError('Not enough unallocated stock is available', 'INSUFFICIENT_STOCK')
    }

    const allocatedAfter = balance.allocated.plus(quantity)
    await tx.componentBalance.update({
      where: { componentId: line.componentId },
      data: { allocated: allocatedAfter, version: { increment: 1 } },
    })
    const entry = await tx.inventoryAllocationEntry.create({
      data: {
        reservationLineId: line.id,
        type: AllocationEntryType.ALLOCATE,
        quantity,
        componentAllocatedAfter: allocatedAfter,
        sourceType: 'RESERVATION_ALLOCATION',
        sourceId: input.sourceId,
        createdById: input.actorId,
        remarks: input.remarks,
      },
    })
    await refreshReservationStatus(tx, line.reservationId)
    return entry
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function releaseReservationLine(input: {
  reservationId?: string
  reservationLineId: string
  quantity: QuantityInput
  actorId: string
  sourceId: string
  remarks?: string
}) {
  const quantity = positive(input.quantity)
  return db.$transaction(async (tx) => {
    const line = await tx.reservationLine.findUnique({ where: { id: input.reservationLineId } })
    if (!line) throw new InventoryDomainError('Reservation line was not found', 'NOT_FOUND')
    if (input.reservationId && line.reservationId !== input.reservationId) {
      throw new InventoryDomainError('Reservation line does not belong to this reservation', 'INVALID_STATE')
    }
    const totals = await reservationLineTotals(tx, line.id)
    if (quantity.greaterThan(totals.allocated)) {
      throw new InventoryDomainError('Release quantity exceeds the active allocation', 'INSUFFICIENT_ALLOCATION')
    }
    const balance = await lockBalance(tx, line.componentId)
    const allocatedAfter = balance.allocated.minus(quantity)
    await tx.componentBalance.update({
      where: { componentId: line.componentId },
      data: { allocated: allocatedAfter, version: { increment: 1 } },
    })
    const entry = await tx.inventoryAllocationEntry.create({
      data: {
        reservationLineId: line.id,
        type: AllocationEntryType.RELEASE,
        quantity: quantity.negated(),
        componentAllocatedAfter: allocatedAfter,
        sourceType: 'RESERVATION_RELEASE',
        sourceId: input.sourceId,
        createdById: input.actorId,
        remarks: input.remarks,
      },
    })
    await refreshReservationStatus(tx, line.reservationId)
    return entry
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function cancelReservationLine(input: {
  reservationId?: string
  reservationLineId: string
  quantity: QuantityInput
  actorId: string
  sourceId: string
  reason: string
}) {
  const quantity = positive(input.quantity)
  if (!input.reason.trim()) throw new InventoryDomainError('Cancellation reason is required', 'INVALID_STATE')
  return db.$transaction(async (tx) => {
    const line = await tx.reservationLine.findUnique({ where: { id: input.reservationLineId } })
    if (!line) throw new InventoryDomainError('Reservation line was not found', 'NOT_FOUND')
    if (input.reservationId && line.reservationId !== input.reservationId) {
      throw new InventoryDomainError('Reservation line does not belong to this reservation', 'INVALID_STATE')
    }
    const totals = await reservationLineTotals(tx, line.id)
    const cancellable = Prisma.Decimal.max(totals.target.minus(totals.cancelled).minus(totals.issued), ZERO)
    if (quantity.greaterThan(cancellable)) {
      throw new InventoryDomainError('Cancellation exceeds the unissued requirement', 'OVER_FULFILLMENT')
    }
    const remainingAfter = cancellable.minus(quantity)
    const releaseQuantity = Prisma.Decimal.max(totals.allocated.minus(remainingAfter), ZERO)
    if (releaseQuantity.isPositive()) {
      const balance = await lockBalance(tx, line.componentId)
      const allocatedAfter = balance.allocated.minus(releaseQuantity)
      await tx.componentBalance.update({
        where: { componentId: line.componentId },
        data: { allocated: allocatedAfter, version: { increment: 1 } },
      })
      await tx.inventoryAllocationEntry.create({
        data: {
          reservationLineId: line.id,
          type: AllocationEntryType.RELEASE,
          quantity: releaseQuantity.negated(),
          componentAllocatedAfter: allocatedAfter,
          sourceType: 'RESERVATION_CANCELLATION_RELEASE',
          sourceId: input.sourceId,
          createdById: input.actorId,
          remarks: `Released by cancellation: ${input.reason.trim()}`,
        },
      })
    }
    const cancellation = await tx.reservationCancellationEntry.create({
      data: {
        reservationLineId: line.id,
        quantity,
        reason: input.reason.trim(),
        sourceId: input.sourceId,
        createdById: input.actorId,
      },
    })
    await refreshReservationStatus(tx, line.reservationId)
    return cancellation
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function cancelReservation(input: {
  reservationId: string
  actorId: string
  sourceId: string
  reason: string
}) {
  if (!input.reason.trim()) throw new InventoryDomainError('Cancellation reason is required', 'INVALID_STATE')
  return db.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: input.reservationId },
      include: { lines: true },
    })
    if (!reservation) throw new InventoryDomainError('Reservation was not found', 'NOT_FOUND')
    if (reservation.status === ReservationStatus.CANCELLED) return reservation
    if (reservation.status === ReservationStatus.CLOSED) {
      throw new InventoryDomainError('A fulfilled reservation cannot be cancelled', 'INVALID_STATE')
    }

    for (const line of reservation.lines) {
      const totals = await reservationLineTotals(tx, line.id)
      if (totals.allocated.isPositive()) {
        const balance = await lockBalance(tx, line.componentId)
        const allocatedAfter = balance.allocated.minus(totals.allocated)
        await tx.componentBalance.update({
          where: { componentId: line.componentId },
          data: { allocated: allocatedAfter, version: { increment: 1 } },
        })
        await tx.inventoryAllocationEntry.create({
          data: {
            reservationLineId: line.id,
            type: AllocationEntryType.RELEASE,
            quantity: totals.allocated.negated(),
            componentAllocatedAfter: allocatedAfter,
            sourceType: 'RESERVATION_CANCELLATION_RELEASE',
            sourceId: `${input.sourceId}:${line.id}`,
            createdById: input.actorId,
            remarks: `Released by reservation cancellation: ${input.reason.trim()}`,
          },
        })
      }
      const cancellable = Prisma.Decimal.max(totals.target.minus(totals.cancelled).minus(totals.issued), ZERO)
      if (cancellable.isPositive()) {
        await tx.reservationCancellationEntry.create({
          data: {
            reservationLineId: line.id,
            quantity: cancellable,
            reason: input.reason.trim(),
            sourceId: `${input.sourceId}:cancel:${line.id}`,
            createdById: input.actorId,
          },
        })
      }
    }
    return tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: ReservationStatus.CANCELLED,
        cancelledById: input.actorId,
        cancelledAt: new Date(),
        cancellationReason: input.reason.trim(),
        closedAt: null,
      },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function postPartialIssue(input: {
  issueNo: string
  idempotencyKey?: string
  reservationId: string
  actorId: string
  remarks?: string
  lines: Array<{ reservationLineId: string; quantity: QuantityInput; remarks?: string }>
}) {
  if (input.lines.length === 0) {
    throw new InventoryDomainError('At least one issue line is required', 'INVALID_QUANTITY')
  }
  if (new Set(input.lines.map((line) => line.reservationLineId)).size !== input.lines.length) {
    throw new InventoryDomainError('A reservation line can only appear once per issue', 'INVALID_STATE')
  }

  return db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.stockIssue.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } })
      if (existing) {
        if (existing.reservationId !== input.reservationId) throw new InventoryDomainError('Idempotency key belongs to another reservation', 'INVALID_STATE')
        return existing
      }
    }
    const reservation = await tx.reservation.findUnique({ where: { id: input.reservationId } })
    if (!reservation) throw new InventoryDomainError('Reservation was not found', 'NOT_FOUND')
    if (
      reservation.status === ReservationStatus.CLOSED
      || reservation.status === ReservationStatus.CANCELLED
    ) {
      throw new InventoryDomainError(`Cannot issue against a ${reservation.status.toLowerCase()} reservation`, 'INVALID_STATE')
    }

    const issue = await tx.stockIssue.create({
      data: {
        issueNo: input.issueNo,
        idempotencyKey: input.idempotencyKey,
        reservationId: input.reservationId,
        postedById: input.actorId,
        remarks: input.remarks,
      },
    })

    for (const requestedLine of input.lines) {
      const quantity = positive(requestedLine.quantity)
      const line = await tx.reservationLine.findUnique({ where: { id: requestedLine.reservationLineId } })
      if (!line || line.reservationId !== input.reservationId) {
        throw new InventoryDomainError('Issue line does not belong to this reservation', 'INVALID_STATE')
      }

      const totals = await reservationLineTotals(tx, line.id)
      if (quantity.greaterThan(totals.allocated)) {
        throw new InventoryDomainError('Issue quantity exceeds the active allocation', 'INSUFFICIENT_ALLOCATION')
      }
      const target = totals.target.minus(totals.cancelled)
      if (totals.issued.plus(quantity).greaterThan(target)) {
        throw new InventoryDomainError('Issue quantity exceeds the reservation quantity', 'OVER_FULFILLMENT')
      }

      const balance = await lockBalance(tx, line.componentId)
      if (quantity.greaterThan(balance.onHand) || quantity.greaterThan(balance.allocated)) {
        throw new InventoryDomainError('Allocated stock is no longer available', 'INSUFFICIENT_STOCK')
      }

      const issueLine = await tx.stockIssueLine.create({
        data: {
          issueId: issue.id,
          reservationLineId: line.id,
          componentId: line.componentId,
          quantity,
          remarks: requestedLine.remarks,
        },
      })

      const allocatedAfter = balance.allocated.minus(quantity)
      await tx.componentBalance.update({
        where: { componentId: line.componentId },
        data: { allocated: allocatedAfter, version: { increment: 1 } },
      })
      await tx.inventoryAllocationEntry.create({
        data: {
          reservationLineId: line.id,
          type: AllocationEntryType.CONSUME,
          quantity: quantity.negated(),
          componentAllocatedAfter: allocatedAfter,
          sourceType: 'STOCK_ISSUE_LINE',
          sourceId: issueLine.id,
          createdById: input.actorId,
        },
      })
      await postMovement(tx, {
        componentId: line.componentId,
        type: InventoryLedgerEntryType.ISSUE,
        quantity: quantity.negated(),
        sourceType: 'STOCK_ISSUE',
        sourceId: issue.id,
        sourceLineId: issueLine.id,
        actorId: input.actorId,
        remarks: requestedLine.remarks,
      })
    }

    await refreshReservationStatus(tx, input.reservationId)
    return tx.stockIssue.findUnique({ where: { id: issue.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function postGoodsReceipt(input: {
  receiptNo: string
  idempotencyKey?: string
  actorId: string
  purchaseRequestId?: string
  provider?: string
  trackingNumber?: string
  boxNumber?: string
  remarks?: string
  lines: Array<{
    componentId: string
    purchaseRequestLineId?: string
    quantity: QuantityInput
    unitCost?: QuantityInput
    remarks?: string
  }>
}) {
  if (input.lines.length === 0) {
    throw new InventoryDomainError('At least one receipt line is required', 'INVALID_QUANTITY')
  }

  return db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.goodsReceipt.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } })
      if (existing) {
        if (existing.purchaseRequestId !== (input.purchaseRequestId ?? null)) throw new InventoryDomainError('Idempotency key belongs to another purchase request', 'INVALID_STATE')
        return existing
      }
    }
    if (input.purchaseRequestId) {
      const purchaseRequest = await tx.purchaseRequest.findUnique({ where: { id: input.purchaseRequestId } })
      if (!purchaseRequest) throw new InventoryDomainError('Purchase request was not found', 'NOT_FOUND')
      if (!['ORDERED', 'SHIPPED'].includes(purchaseRequest.status)) {
        throw new InventoryDomainError('Only ordered or shipped purchase requests can be received', 'INVALID_STATE')
      }
    }

    const receipt = await tx.goodsReceipt.create({
      data: {
        receiptNo: input.receiptNo,
        idempotencyKey: input.idempotencyKey,
        purchaseRequestId: input.purchaseRequestId,
        provider: input.provider,
        trackingNumber: input.trackingNumber,
        boxNumber: input.boxNumber,
        postedById: input.actorId,
        remarks: input.remarks,
      },
    })

    for (const requestedLine of input.lines) {
      const quantity = positive(requestedLine.quantity)
      if (input.purchaseRequestId) {
        if (!requestedLine.purchaseRequestLineId) {
          throw new InventoryDomainError('A purchase request receipt must identify each purchase line', 'INVALID_STATE')
        }
        const purchaseLine = await tx.purchaseRequestLine.findFirst({
          where: { id: requestedLine.purchaseRequestLineId, purchaseRequestId: input.purchaseRequestId },
        })
        if (!purchaseLine || purchaseLine.componentId !== requestedLine.componentId) {
          throw new InventoryDomainError('Receipt line does not match the purchase request', 'INVALID_STATE')
        }
        const alreadyReceived = await tx.goodsReceiptLine.aggregate({
          where: { purchaseRequestLineId: purchaseLine.id },
          _sum: { quantity: true },
        })
        if ((alreadyReceived._sum.quantity ?? ZERO).plus(quantity).greaterThan(purchaseLine.quantity)) {
          throw new InventoryDomainError('Receipt quantity exceeds the purchase request line', 'OVER_FULFILLMENT')
        }
      }
      const line = await tx.goodsReceiptLine.create({
        data: {
          receiptId: receipt.id,
          purchaseRequestLineId: requestedLine.purchaseRequestLineId,
          componentId: requestedLine.componentId,
          quantity,
          unitCost: requestedLine.unitCost === undefined ? undefined : decimal(requestedLine.unitCost),
          remarks: requestedLine.remarks,
        },
      })
      await postMovement(tx, {
        componentId: requestedLine.componentId,
        type: InventoryLedgerEntryType.RECEIVE,
        quantity,
        sourceType: 'GOODS_RECEIPT',
        sourceId: receipt.id,
        sourceLineId: line.id,
        actorId: input.actorId,
        remarks: requestedLine.remarks,
      })
    }

    if (input.purchaseRequestId) {
      const lines = await tx.purchaseRequestLine.findMany({
        where: { purchaseRequestId: input.purchaseRequestId },
        include: { receiptLines: { select: { quantity: true } } },
      })
      const fullyReceived = lines.length > 0 && lines.every((line) =>
        line.receiptLines.reduce((sum, receiptLine) => sum.plus(receiptLine.quantity), ZERO).greaterThanOrEqualTo(line.quantity)
      )
      if (fullyReceived) {
        await tx.purchaseRequest.update({
          where: { id: input.purchaseRequestId },
          data: { status: 'RECEIVED_IN_STORE', receivedAt: new Date() },
        })
      }
    }

    return tx.goodsReceipt.findUnique({ where: { id: receipt.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function postStockReturn(input: {
  returnNo: string
  idempotencyKey?: string
  actorId: string
  reason?: string
  remarks?: string
  lines: Array<{ issueLineId: string; quantity: QuantityInput; remarks?: string }>
}) {
  if (input.lines.length === 0) {
    throw new InventoryDomainError('At least one return line is required', 'INVALID_QUANTITY')
  }

  return db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.stockReturn.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } })
      if (existing) return existing
    }
    const affectedReservationIds = new Set<string>()
    const stockReturn = await tx.stockReturn.create({
      data: {
        returnNo: input.returnNo,
        idempotencyKey: input.idempotencyKey,
        postedById: input.actorId,
        reason: input.reason,
        remarks: input.remarks,
      },
    })

    for (const requestedLine of input.lines) {
      const quantity = positive(requestedLine.quantity)
      const issueLine = await tx.stockIssueLine.findUnique({ where: { id: requestedLine.issueLineId } })
      if (!issueLine) throw new InventoryDomainError('Original issue line was not found', 'NOT_FOUND')
      const reservationLine = await tx.reservationLine.findUnique({
        where: { id: issueLine.reservationLineId },
        select: { reservationId: true },
      })
      if (!reservationLine) throw new InventoryDomainError('Reservation line was not found', 'NOT_FOUND')
      affectedReservationIds.add(reservationLine.reservationId)
      const returned = await tx.stockReturnLine.aggregate({
        where: { issueLineId: issueLine.id },
        _sum: { quantity: true },
      })
      if ((returned._sum.quantity ?? ZERO).plus(quantity).greaterThan(issueLine.quantity)) {
        throw new InventoryDomainError('Return quantity exceeds the quantity originally issued', 'OVER_FULFILLMENT')
      }

      const line = await tx.stockReturnLine.create({
        data: {
          returnId: stockReturn.id,
          issueLineId: issueLine.id,
          componentId: issueLine.componentId,
          quantity,
          remarks: requestedLine.remarks,
        },
      })
      await postMovement(tx, {
        componentId: issueLine.componentId,
        type: InventoryLedgerEntryType.RETURN,
        quantity,
        sourceType: 'STOCK_RETURN',
        sourceId: stockReturn.id,
        sourceLineId: line.id,
        actorId: input.actorId,
        remarks: requestedLine.remarks,
      })
    }

    for (const reservationId of affectedReservationIds) {
      await refreshReservationStatus(tx, reservationId)
    }

    return tx.stockReturn.findUnique({ where: { id: stockReturn.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function postInventoryAdjustment(input: {
  adjustmentNo: string
  idempotencyKey?: string
  kind?: 'OPENING' | 'ADJUSTMENT'
  actorId: string
  reason: string
  remarks?: string
  lines: Array<{ componentId: string; quantity: QuantityInput; remarks?: string }>
}) {
  if (input.lines.length === 0) {
    throw new InventoryDomainError('At least one adjustment line is required', 'INVALID_QUANTITY')
  }

  return db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.inventoryAdjustment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } })
      if (existing) return existing
    }
    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        adjustmentNo: input.adjustmentNo,
        idempotencyKey: input.idempotencyKey,
        postedById: input.actorId,
        reason: input.reason,
        remarks: input.remarks,
      },
    })

    for (const requestedLine of input.lines) {
      const quantity = decimal(requestedLine.quantity)
      if (quantity.isZero()) {
        throw new InventoryDomainError('Adjustment quantity cannot be zero', 'INVALID_QUANTITY')
      }
      if (input.kind === 'OPENING') {
        if (!quantity.isPositive()) throw new InventoryDomainError('Opening quantity must be positive', 'INVALID_QUANTITY')
        const priorMovement = await tx.inventoryLedgerEntry.findFirst({ where: { componentId: requestedLine.componentId } })
        if (priorMovement) throw new InventoryDomainError('Opening stock can only be posted before the component has movements', 'INVALID_STATE')
      }
      const line = await tx.inventoryAdjustmentLine.create({
        data: {
          adjustmentId: adjustment.id,
          componentId: requestedLine.componentId,
          quantity,
          remarks: requestedLine.remarks,
        },
      })
      await postMovement(tx, {
        componentId: requestedLine.componentId,
        type: input.kind === 'OPENING'
          ? InventoryLedgerEntryType.OPENING
          : quantity.isPositive()
            ? InventoryLedgerEntryType.ADJUSTMENT_IN
            : InventoryLedgerEntryType.ADJUSTMENT_OUT,
        quantity,
        sourceType: input.kind === 'OPENING' ? 'OPENING_STOCK' : 'INVENTORY_ADJUSTMENT',
        sourceId: adjustment.id,
        sourceLineId: line.id,
        actorId: input.actorId,
        remarks: requestedLine.remarks,
      })
    }

    return tx.inventoryAdjustment.findUnique({ where: { id: adjustment.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
