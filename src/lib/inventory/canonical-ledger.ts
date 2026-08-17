import {
  AllocationEntryType,
  CanonicalReservationStatus,
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
  const [allocation, issued] = await Promise.all([
    tx.inventoryAllocationEntry.aggregate({
      where: { reservationLineId },
      _sum: { quantity: true },
    }),
    tx.stockIssueLine.aggregate({
      where: { reservationLineId },
      _sum: { quantity: true },
    }),
  ])

  return {
    allocated: allocation._sum.quantity ?? ZERO,
    issued: issued._sum.quantity ?? ZERO,
  }
}

async function reservationLineTarget(
  tx: Prisma.TransactionClient,
  line: { projectComponentId: string | null; requestedQuantity: Prisma.Decimal | null }
) {
  if (!line.projectComponentId) {
    if (!line.requestedQuantity) {
      throw new InventoryDomainError('A general reservation line requires a fixed quantity', 'INVALID_STATE')
    }
    return line.requestedQuantity
  }

  const rows = await tx.$queryRaw<Array<{ grossRequired: Prisma.Decimal }>>`
    SELECT "grossRequired"
      FROM "project_component_requirements"
     WHERE "projectComponentId" = ${line.projectComponentId}
  `
  if (!rows[0]) {
    throw new InventoryDomainError('The project component requirement was not found', 'NOT_FOUND')
  }
  return rows[0].grossRequired
}

async function refreshReservationStatus(tx: Prisma.TransactionClient, reservationId: string) {
  const reservation = await tx.reservation.findUnique({
    where: { id: reservationId },
    include: {
      lines: {
        include: {
          allocationEntries: { select: { quantity: true } },
          issueLines: { select: { quantity: true } },
        },
      },
    },
  })
  if (!reservation) throw new InventoryDomainError('Reservation was not found', 'NOT_FOUND')
  if (reservation.status === CanonicalReservationStatus.CANCELLED) return reservation

  let allFulfilled = reservation.lines.length > 0
  let allCovered = reservation.lines.length > 0
  let anyCovered = false
  let anyIssued = false

  for (const line of reservation.lines) {
    const target = (await reservationLineTarget(tx, line)).minus(line.cancelledQuantity)
    const issued = line.issueLines.reduce((sum, item) => sum.plus(item.quantity), ZERO)
    const allocated = line.allocationEntries.reduce((sum, item) => sum.plus(item.quantity), ZERO)
    const covered = issued.plus(allocated)

    if (issued.isPositive()) anyIssued = true
    if (covered.isPositive()) anyCovered = true
    if (issued.lessThan(target)) allFulfilled = false
    if (covered.lessThan(target)) allCovered = false
  }

  let status: CanonicalReservationStatus
  if (allFulfilled) status = CanonicalReservationStatus.CLOSED
  else if (anyIssued) status = CanonicalReservationStatus.PARTIALLY_ISSUED
  else if (allCovered) status = CanonicalReservationStatus.AVAILABLE
  else if (anyCovered) status = CanonicalReservationStatus.PARTIALLY_AVAILABLE
  else status = CanonicalReservationStatus.PENDING_STOCK

  return tx.reservation.update({
    where: { id: reservationId },
    data: {
      status,
      closedAt: status === CanonicalReservationStatus.CLOSED ? new Date() : null,
    },
  })
}

export async function allocateReservationLine(input: {
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

    const totals = await reservationLineTotals(tx, line.id)
    const target = (await reservationLineTarget(tx, line)).minus(line.cancelledQuantity)
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

export async function postPartialIssue(input: {
  issueNo: string
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
    const reservation = await tx.reservation.findUnique({ where: { id: input.reservationId } })
    if (!reservation) throw new InventoryDomainError('Reservation was not found', 'NOT_FOUND')
    if (
      reservation.status === CanonicalReservationStatus.CLOSED
      || reservation.status === CanonicalReservationStatus.CANCELLED
    ) {
      throw new InventoryDomainError(`Cannot issue against a ${reservation.status.toLowerCase()} reservation`, 'INVALID_STATE')
    }

    const issue = await tx.stockIssue.create({
      data: {
        issueNo: input.issueNo,
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
      const target = (await reservationLineTarget(tx, line)).minus(line.cancelledQuantity)
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

    return tx.goodsReceipt.findUnique({ where: { id: receipt.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function postStockReturn(input: {
  returnNo: string
  actorId: string
  reason?: string
  remarks?: string
  lines: Array<{ issueLineId: string; quantity: QuantityInput; remarks?: string }>
}) {
  if (input.lines.length === 0) {
    throw new InventoryDomainError('At least one return line is required', 'INVALID_QUANTITY')
  }

  return db.$transaction(async (tx) => {
    const stockReturn = await tx.stockReturn.create({
      data: {
        returnNo: input.returnNo,
        postedById: input.actorId,
        reason: input.reason,
        remarks: input.remarks,
      },
    })

    for (const requestedLine of input.lines) {
      const quantity = positive(requestedLine.quantity)
      const issueLine = await tx.stockIssueLine.findUnique({ where: { id: requestedLine.issueLineId } })
      if (!issueLine) throw new InventoryDomainError('Original issue line was not found', 'NOT_FOUND')
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

    return tx.stockReturn.findUnique({ where: { id: stockReturn.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function postInventoryAdjustment(input: {
  adjustmentNo: string
  actorId: string
  reason: string
  remarks?: string
  lines: Array<{ componentId: string; quantity: QuantityInput; remarks?: string }>
}) {
  if (input.lines.length === 0) {
    throw new InventoryDomainError('At least one adjustment line is required', 'INVALID_QUANTITY')
  }

  return db.$transaction(async (tx) => {
    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        adjustmentNo: input.adjustmentNo,
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
        type: quantity.isPositive()
          ? InventoryLedgerEntryType.ADJUSTMENT_IN
          : InventoryLedgerEntryType.ADJUSTMENT_OUT,
        quantity,
        sourceType: 'INVENTORY_ADJUSTMENT',
        sourceId: adjustment.id,
        sourceLineId: line.id,
        actorId: input.actorId,
        remarks: requestedLine.remarks,
      })
    }

    return tx.inventoryAdjustment.findUnique({ where: { id: adjustment.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
