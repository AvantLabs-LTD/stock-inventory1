import { Prisma, PurchaseRequestStatus } from "@prisma/client"
import { db } from "@/lib/db"
import { DomainError } from "@/lib/inventory-service"

type TransactionClient = Prisma.TransactionClient

export const ACTIVE_PURCHASE_STATUSES: PurchaseRequestStatus[] = ["BACKLOG", "PENDING_ORDER_APPROVAL", "ORDERED", "SHIPPED"]

export async function validateDemandCoverage(
  tx: TransactionClient,
  input: { demandLineId: string; itemId: string; quantity: Prisma.Decimal; existingQuantity?: Prisma.Decimal },
) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "demand_lines" WHERE "id"=${input.demandLineId} FOR UPDATE`)
  const rows = await tx.$queryRaw<Array<{
    itemId: string | null
    state: string
    remaining: Prisma.Decimal
    unprocuredDeficit: Prisma.Decimal
  }>>(Prisma.sql`
    SELECT q."itemId",d."state",q.remaining,COALESCE(s."unprocuredDeficit",0) "unprocuredDeficit"
    FROM "demand_line_quantities" q
    JOIN "demands" d ON d."id"=q."demandId"
    LEFT JOIN "demand_line_supply" s ON s."demandLineId"=q."demandLineId"
    WHERE q."demandLineId"=${input.demandLineId}
  `)
  const demand = rows[0]
  if (!demand || demand.itemId !== input.itemId || !["SUBMITTED", "ACTIVE"].includes(demand.state)) {
    throw new DomainError("INVALID_DEMAND_LINK", "Purchase coverage must target an open demand row for the same component")
  }
  if (input.quantity.lte(0)) throw new DomainError("INVALID_QUANTITY", "Linked coverage must be positive")
  const availableGap = demand.unprocuredDeficit.plus(input.existingQuantity || 0)
  if (input.quantity.gt(availableGap)) {
    throw new DomainError("DEMAND_OVER_COVERAGE", `Linked coverage exceeds the demand's unprocured deficit of ${availableGap.toString()}`)
  }
  return demand
}

export async function requireEditableBacklog(tx: TransactionClient, purchaseRequestId: string) {
  const purchase = await tx.purchaseRequest.findUnique({ where: { id: purchaseRequestId } })
  if (!purchase) throw new DomainError("PURCHASE_NOT_FOUND", "Purchase request not found", 404)
  if (purchase.status !== "BACKLOG") throw new DomainError("PURCHASE_NOT_EDITABLE", "Demand coverage can only be changed while the purchase is in backlog")
  return purchase
}

type GoodsReceiptRow = {
  purchaseRequestLineId: string
  quantity: Prisma.Decimal
  unitCost?: Prisma.Decimal
  remarks?: string
}

function parseGoodsReceiptRows(value: unknown): GoodsReceiptRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DomainError("RECEIPT_LINES_REQUIRED", "At least one receipt row is required")
  }
  if (value.length > 100) {
    throw new DomainError("TOO_MANY_RECEIPT_LINES", "A goods receipt may contain at most 100 rows")
  }

  const lineIds = new Set<string>()
  return value.map(raw => {
    if (!raw || typeof raw !== "object") throw new DomainError("INVALID_RECEIPT_LINE", "Invalid receipt row")
    const row = raw as Record<string, unknown>
    const purchaseRequestLineId = typeof row.purchaseRequestLineId === "string" ? row.purchaseRequestLineId.trim() : ""
    if (!purchaseRequestLineId) throw new DomainError("PURCHASE_LINE_REQUIRED", "Every receipt row needs a purchase line")
    if (lineIds.has(purchaseRequestLineId)) {
      throw new DomainError("DUPLICATE_RECEIPT_LINE", "Each purchase line may appear only once in a goods receipt")
    }
    lineIds.add(purchaseRequestLineId)

    let quantity: Prisma.Decimal
    let unitCost: Prisma.Decimal | undefined
    try {
      quantity = new Prisma.Decimal(row.quantity as Prisma.Decimal.Value)
      if (row.unitCost !== undefined && row.unitCost !== null && row.unitCost !== "") {
        unitCost = new Prisma.Decimal(row.unitCost as Prisma.Decimal.Value)
      }
    } catch {
      throw new DomainError("INVALID_QUANTITY", "Receipt quantity or unit cost is invalid")
    }
    if (quantity.lte(0)) throw new DomainError("INVALID_QUANTITY", "Receipt quantities must be positive")
    if (unitCost?.lt(0)) throw new DomainError("INVALID_UNIT_COST", "Unit cost cannot be negative")

    return {
      purchaseRequestLineId,
      quantity,
      unitCost,
      remarks: typeof row.remarks === "string" ? row.remarks.trim() || undefined : undefined,
    }
  })
}

export async function postGoodsReceipt(input: {
  purchaseRequestId: string
  actorId: string
  actorName: string
  idempotencyKey?: string
  remarks?: string
  lines: unknown
}) {
  const rows = parseGoodsReceiptRows(input.lines)
  return db.$transaction(async tx => {
    if (input.idempotencyKey) {
      const found = await tx.goodsReceipt.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } })
      if (found) {
        if (found.purchaseRequestId !== input.purchaseRequestId) {
          throw new DomainError("IDEMPOTENCY_KEY_CONFLICT", "This idempotency key was already used for another purchase request", 409)
        }
        const samePayload = found.lines.length === rows.length && rows.every(row => {
          const existing = found.lines.find(line => line.purchaseRequestLineId === row.purchaseRequestLineId)
          return existing
            && existing.quantity.eq(row.quantity)
            && (existing.unitCost?.eq(row.unitCost ?? 0) ?? row.unitCost === undefined)
            && (existing.remarks || undefined) === row.remarks
        })
        if (!samePayload) {
          throw new DomainError("IDEMPOTENCY_KEY_CONFLICT", "This idempotency key was already used with different receipt details", 409)
        }
        return found
      }
    }

    const purchase = await tx.purchaseRequest.findUnique({
      where: { id: input.purchaseRequestId },
      include: { lines: { include: { receiptLines: true } } },
    })
    if (!purchase || !["ORDERED", "SHIPPED"].includes(purchase.status)) {
      throw new DomainError("PURCHASE_NOT_RECEIVABLE", "Only ordered or shipped requests may be received")
    }

    const receipt = await tx.goodsReceipt.create({ data: {
      receiptNo: "REC-" + Date.now() + "-" + Math.floor(Math.random() * 1000).toString().padStart(3, "0"),
      purchaseRequestId: input.purchaseRequestId,
      postedById: input.actorId,
      idempotencyKey: input.idempotencyKey,
      remarks: input.remarks,
    } })

    const auditLines: Array<{ purchaseRequestLineId: string; itemId: string; quantity: string; onHandAfter: string }> = []
    for (const row of rows) {
      const purchaseLine = purchase.lines.find(line => line.id === row.purchaseRequestLineId)
      if (!purchaseLine) throw new DomainError("INVALID_RECEIPT_LINE", "A receipt row does not belong to this purchase request")
      const received = purchaseLine.receiptLines.reduce((total, line) => total.plus(line.quantity), new Prisma.Decimal(0))
      if (received.plus(row.quantity).gt(purchaseLine.quantity)) {
        throw new DomainError("OVER_RECEIPT", "Receipt exceeds ordered quantity")
      }

      const line = await tx.goodsReceiptLine.create({ data: {
        receiptId: receipt.id,
        purchaseRequestLineId: purchaseLine.id,
        itemId: purchaseLine.itemId,
        quantity: row.quantity,
        unitCost: row.unitCost,
        remarks: row.remarks,
      } })
      const stock = await tx.itemBalance.upsert({ where: { itemId: purchaseLine.itemId }, update: {}, create: { itemId: purchaseLine.itemId } })
      const after = stock.onHand.plus(row.quantity)
      await tx.itemBalance.update({ where: { itemId: purchaseLine.itemId }, data: { onHand: after, version: { increment: 1 } } })
      await tx.inventoryLedgerEntry.create({ data: {
        itemId: purchaseLine.itemId,
        type: "RECEIPT",
        quantity: row.quantity,
        onHandAfter: after,
        sourceType: "GOODS_RECEIPT",
        sourceId: receipt.id,
        sourceLineId: line.id,
        actorId: input.actorId,
        remarks: row.remarks,
      } })
      auditLines.push({ purchaseRequestLineId: purchaseLine.id, itemId: purchaseLine.itemId, quantity: row.quantity.toString(), onHandAfter: after.toString() })
    }

    const allLines = await tx.purchaseRequestLine.findMany({
      where: { purchaseRequestId: input.purchaseRequestId },
      include: { receiptLines: true },
    })
    if (allLines.every(line => line.receiptLines.reduce((total, receiptLine) => total.plus(receiptLine.quantity), new Prisma.Decimal(0)).gte(line.quantity))) {
      await tx.purchaseRequest.update({ where: { id: input.purchaseRequestId }, data: { status: "RECEIVED_IN_STORE", receivedAt: new Date() } })
    }
    await tx.auditLog.create({ data: {
      userId: input.actorId,
      userName: input.actorName,
      action: "POST_GOODS_RECEIPT",
      entityType: "GoodsReceipt",
      entityId: receipt.id,
      details: JSON.stringify({ receiptNo: receipt.receiptNo, purchaseRequestId: input.purchaseRequestId, lines: auditLines }),
    } })
    return tx.goodsReceipt.findUniqueOrThrow({ where: { id: receipt.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
