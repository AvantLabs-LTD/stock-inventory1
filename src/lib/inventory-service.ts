import { Prisma, PrismaClient, ProcurementType } from "@prisma/client"
import { db } from "@/lib/db"

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]
const dec = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v)
const textValue = (value?: string | null) => value?.trim() || null

export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}

export const normalizeName = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase()

async function quantities(tx: Tx, lineId: string) {
  const line = await tx.demandLine.findUnique({ where: { id: lineId } })
  if (!line) throw new DomainError("DEMAND_LINE_NOT_FOUND", "Demand row was not found", 404)
  const [revisions, issued, returned] = await Promise.all([
    tx.demandApprovalRevision.aggregate({ where: { demandLineId: lineId }, _sum: { approvedQuantityDelta: true, fromStockQuantityDelta: true, forProcurementQuantityDelta: true } }),
    tx.demandIssueLine.aggregate({ where: { demandLineId: lineId }, _sum: { quantity: true } }),
    tx.demandReturnLine.aggregate({ where: { issueLine: { demandLineId: lineId } }, _sum: { quantity: true } }),
  ])
  const approved = Prisma.Decimal.max((line.approvedQuantity || dec(0)).plus(revisions._sum.approvedQuantityDelta || 0), 0)
  const approvedFromStock = Prisma.Decimal.max((line.approvedFromStockQuantity || dec(0)).plus(revisions._sum.fromStockQuantityDelta || 0), 0)
  const approvedForProcurement = Prisma.Decimal.max((line.approvedForProcurementQuantity || dec(0)).plus(revisions._sum.forProcurementQuantityDelta || 0), 0)
  const issuedQty = issued._sum.quantity || dec(0)
  const returnedQty = returned._sum.quantity || dec(0)
  const netIssued = Prisma.Decimal.max(issuedQty.minus(returnedQty), 0)
  return {
    line,
    approved,
    approvedFromStock,
    approvedForProcurement,
    issued: issuedQty,
    returned: returnedQty,
    netIssued,
    allocated: Prisma.Decimal.max(approvedFromStock.minus(netIssued), 0),
    remaining: Prisma.Decimal.max(approved.minus(netIssued), 0),
  }
}

async function balance(tx: Tx, itemId: string) {
  return tx.itemBalance.upsert({ where: { itemId }, update: {}, create: { itemId } })
}

async function refreshDemandState(tx: Tx, demandId: string, actorId: string) {
  const rows = await tx.$queryRaw<Array<{ fulfilmentFacet: string }>>(Prisma.sql`
    SELECT "fulfilmentFacet" FROM "demand_line_quantities" WHERE "demandId"=${demandId}
  `)
  if (!rows.length) return
  const now = new Date()
  if (rows.every(row => row.fulfilmentFacet === "CANCELLED")) {
    await tx.demand.update({ where: { id: demandId }, data: { state: "CANCELLED", cancelledAt: now, cancelledById: actorId, cancellationReason: "All approved quantities withdrawn", closedAt: null, closedById: null } })
  } else if (rows.every(row => ["ISSUED", "CANCELLED"].includes(row.fulfilmentFacet))) {
    await tx.demand.update({ where: { id: demandId }, data: { state: "CLOSED", closedAt: now, closedById: actorId, cancelledAt: null, cancelledById: null, cancellationReason: null } })
  } else {
    await tx.demand.update({ where: { id: demandId }, data: { state: "ACTIVE", closedAt: null, closedById: null, cancelledAt: null, cancelledById: null, cancellationReason: null } })
  }
}

export async function cancelDemandLine(input: {
  lineId: string
  actorId: string
  actorName: string
  quantity: Prisma.Decimal.Value
  fromStockQuantity?: Prisma.Decimal.Value
  forProcurementQuantity?: Prisma.Decimal.Value
  reason?: string
  idempotencyKey?: string
}) {
  const reason = input.reason?.trim()
  if (!reason) throw new DomainError("CANCELLATION_REASON_REQUIRED", "A cancellation reason is required")
  let amount: Prisma.Decimal
  try { amount = dec(input.quantity) } catch { throw new DomainError("INVALID_QUANTITY", "Cancellation quantity is invalid") }
  if (amount.lte(0)) throw new DomainError("INVALID_QUANTITY", "Cancellation quantity must be positive")

  return db.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "demand_lines" WHERE "id"=${input.lineId} FOR UPDATE`)
    const q = await quantities(tx, input.lineId)
    if (!q.line.approvedAt) throw new DomainError("DEMAND_NOT_APPROVED", "Approve this demand row before cancelling approved quantity")
    if (amount.gt(q.remaining)) throw new DomainError("OVER_CANCELLATION", "Cancellation exceeds the remaining approved quantity")

    let fromStock: Prisma.Decimal
    let forProcurement: Prisma.Decimal
    try {
      fromStock = input.fromStockQuantity === undefined ? Prisma.Decimal.min(q.allocated, amount) : dec(input.fromStockQuantity)
      forProcurement = input.forProcurementQuantity === undefined ? amount.minus(fromStock) : dec(input.forProcurementQuantity)
    } catch { throw new DomainError("INVALID_QUANTITY", "Cancellation split is invalid") }
    if (fromStock.lt(0) || forProcurement.lt(0) || !fromStock.plus(forProcurement).eq(amount)) {
      throw new DomainError("UNBALANCED_CANCELLATION", "Cancellation quantity must equal the stock and procurement portions")
    }
    if (fromStock.gt(q.allocated)) throw new DomainError("OVER_STOCK_CANCELLATION", "Stock cancellation exceeds the currently allocated quantity")
    if (forProcurement.gt(q.approvedForProcurement)) throw new DomainError("OVER_PROCUREMENT_CANCELLATION", "Procurement cancellation exceeds the approved procurement quantity")

    const sourceId = input.idempotencyKey || crypto.randomUUID()
    const existing = await tx.demandApprovalRevision.findUnique({ where: { sourceId } })
    if (existing) {
      if (existing.demandLineId !== q.line.id || existing.type !== "CANCELLATION" || !existing.approvedQuantityDelta.eq(amount.negated()) ||
          !existing.fromStockQuantityDelta.eq(fromStock.negated()) || !existing.forProcurementQuantityDelta.eq(forProcurement.negated()) || existing.reason !== reason) {
        throw new DomainError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used with different cancellation details", 409)
      }
      return existing
    }

    if (fromStock.gt(0) && q.line.itemId) {
      await tx.itemBalance.update({ where: { itemId: q.line.itemId }, data: { reserved: { decrement: fromStock }, version: { increment: 1 } } })
    }
    const revision = await tx.demandApprovalRevision.create({ data: {
      demandLineId: q.line.id,
      type: "CANCELLATION",
      approvedQuantityDelta: amount.negated(),
      fromStockQuantityDelta: fromStock.negated(),
      forProcurementQuantityDelta: forProcurement.negated(),
      sourceId,
      reason,
      createdById: input.actorId,
    } })
    await tx.auditLog.create({ data: {
      userId: input.actorId, userName: input.actorName, action: "CANCEL_DEMAND_QUANTITY", entityType: "DemandLine", entityId: q.line.id,
      details: JSON.stringify({ quantity: amount.toString(), fromStock: fromStock.toString(), forProcurement: forProcurement.toString(), reason }),
    } })
    await refreshDemandState(tx, q.line.demandId, input.actorId)
    return revision
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function cancelDemand(input: { demandId: string; actorId: string; actorName: string; reason?: string }) {
  const reason = input.reason?.trim()
  if (!reason) throw new DomainError("CANCELLATION_REASON_REQUIRED", "A cancellation reason is required")
  return db.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "demands" WHERE "id"=${input.demandId} FOR UPDATE`)
    const demand = await tx.demand.findUnique({ where: { id: input.demandId }, include: { lines: true } })
    if (!demand) throw new DomainError("DEMAND_NOT_FOUND", "Demand was not found", 404)
    if (demand.state === "CANCELLED") return demand

    for (const line of demand.lines) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "demand_lines" WHERE "id"=${line.id} FOR UPDATE`)
      const q = await quantities(tx, line.id)
      if (!line.approvedAt) {
        await tx.demandLine.update({ where: { id: line.id }, data: {
          approvedQuantity: 0, approvedFromStockQuantity: 0, approvedForProcurementQuantity: 0,
          approvedAt: new Date(), approvedById: input.actorId, approvalRemarks: reason,
        } })
        continue
      }
      if (q.remaining.lte(0)) continue
      const fromStock = q.allocated
      const forProcurement = q.remaining.minus(fromStock)
      if (fromStock.gt(0) && line.itemId) {
        await tx.itemBalance.update({ where: { itemId: line.itemId }, data: { reserved: { decrement: fromStock }, version: { increment: 1 } } })
      }
      await tx.demandApprovalRevision.create({ data: {
        demandLineId: line.id, type: "CANCELLATION",
        approvedQuantityDelta: q.remaining.negated(), fromStockQuantityDelta: fromStock.negated(), forProcurementQuantityDelta: forProcurement.negated(),
        sourceId: `demand-cancel-${input.demandId}-${line.id}`, reason, createdById: input.actorId,
      } })
    }
    const cancelled = await tx.demand.update({ where: { id: input.demandId }, data: {
      state: "CANCELLED", cancelledAt: new Date(), cancelledById: input.actorId, cancellationReason: reason, closedAt: null, closedById: null,
    } })
    await tx.auditLog.create({ data: {
      userId: input.actorId, userName: input.actorName, action: "CANCEL_DEMAND", entityType: "Demand", entityId: input.demandId,
      details: JSON.stringify({ reason }),
    } })
    return cancelled
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function createDemand(input: {
  requestedById: string; departmentTagId?: string | null; departmentName?: string | null; remarks?: string | null
  lines: Array<{ itemId?: string | null; projectTagId?: string | null; projectName?: string | null
    suggestedCategoryId?: string | null; procurementType?: ProcurementType | null; vendorId?: string | null; vendorName?: string | null
    title?: string; description?: string | null; unit?: string; quantity: Prisma.Decimal.Value; remarks?: string | null }>
}) {
  if (!input.lines.length) throw new DomainError("DEMAND_LINES_REQUIRED", "At least one demand row is required")
  return db.$transaction(async tx => {
    let departmentTagId = input.departmentTagId || null
    if (!departmentTagId && input.departmentName?.trim()) {
      const name = input.departmentName.trim()
      departmentTagId = (await tx.departmentTag.upsert({ where: { normalizedName: normalizeName(name) }, update: {}, create: { name, normalizedName: normalizeName(name) } })).id
    }
    const demand = await tx.demand.create({ data: {
      demandNo: "DEM-" + Date.now() + "-" + Math.floor(Math.random() * 1000).toString().padStart(3, "0"),
      requestedById: input.requestedById, departmentTagId, remarks: input.remarks,
    } })
    for (const [sortOrder, row] of input.lines.entries()) {
      const quantity = dec(row.quantity)
      if (quantity.lte(0)) throw new DomainError("INVALID_QUANTITY", "Demand quantities must be positive")
      const item = row.itemId ? await tx.item.findUnique({ where: { id: row.itemId } }) : null
      if (row.itemId && !item) throw new DomainError("ITEM_NOT_FOUND", "Item was not found", 404)
      let projectTagId = row.projectTagId || null
      if (!projectTagId && row.projectName?.trim()) {
        const name = row.projectName.trim()
        projectTagId = (await tx.projectTag.upsert({ where: { normalizedName: normalizeName(name) }, update: {}, create: { name, normalizedName: normalizeName(name) } })).id
      }
      let vendorId = row.vendorId || null
      if (!vendorId && row.vendorName?.trim()) {
        const name = row.vendorName.trim()
        vendorId = (await tx.vendor.upsert({ where: { normalizedName: normalizeName(name) }, update: {}, create: { name, normalizedName: normalizeName(name) } })).id
      }
      const title = row.title?.trim() || item?.title
      if (!title) throw new DomainError("TITLE_REQUIRED", "Free-text demand rows need a title")
      const suggestedCategoryId = row.suggestedCategoryId || item?.categoryId || null
      await tx.demandLine.create({ data: {
        demandId: demand.id, itemId: item?.id, projectTagId, suggestedCategoryId, procurementType: row.procurementType || null, vendorId,
        itemCodeSnapshot: item?.code, title, description: row.description ?? item?.description,
        unit: row.unit?.trim() || item?.unit || "pcs", requiredQuantity: quantity, remarks: row.remarks, sortOrder,
      } })
    }
    return tx.demand.findUnique({ where: { id: demand.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function approveDemandLine(input: {
  lineId: string
  actorId: string
  actorName: string
  approvedQuantity: Prisma.Decimal.Value
  fromStockQuantity: Prisma.Decimal.Value
  forProcurementQuantity: Prisma.Decimal.Value
  remarks?: string
}) {
  let approved: Prisma.Decimal, fromStock: Prisma.Decimal, forProcurement: Prisma.Decimal
  try {
    approved = dec(input.approvedQuantity)
    fromStock = dec(input.fromStockQuantity)
    forProcurement = dec(input.forProcurementQuantity)
  } catch {
    throw new DomainError("INVALID_QUANTITY", "Approval quantities are invalid")
  }
  if (approved.lt(0) || fromStock.lt(0) || forProcurement.lt(0)) throw new DomainError("INVALID_QUANTITY", "Approval quantities cannot be negative")
  if (!fromStock.plus(forProcurement).eq(approved)) throw new DomainError("UNBALANCED_APPROVAL", "Approved quantity must equal the stock and procurement portions")

  return db.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "demand_lines" WHERE "id"=${input.lineId} FOR UPDATE`)
    const line = await tx.demandLine.findUnique({ where: { id: input.lineId }, include: { demand: true } })
    if (!line) throw new DomainError("DEMAND_LINE_NOT_FOUND", "Demand row was not found", 404)
    if (line.approvedAt) throw new DomainError("DEMAND_ALREADY_APPROVED", "This demand row has already been approved; use an approval revision instead", 409)
    if (fromStock.gt(0) && !line.itemId) throw new DomainError("ITEM_RECONCILIATION_REQUIRED", "Link this row to a catalogue component before approving stock fulfilment")
    const demand = line.demand
    if (!demand || ["CLOSED", "CANCELLED"].includes(demand.state)) throw new DomainError("DEMAND_NOT_OPEN", "Demand is not open")
    if (fromStock.gt(0) && line.itemId) {
      const stock = await balance(tx, line.itemId)
      if (fromStock.gt(stock.onHand.minus(stock.reserved))) throw new DomainError("INSUFFICIENT_FREE_STOCK", "The approved stock portion exceeds currently free stock")
      await tx.itemBalance.update({ where: { itemId: line.itemId }, data: { reserved: { increment: fromStock }, version: { increment: 1 } } })
    }
    const now = new Date()
    const updated = await tx.demandLine.update({ where: { id: line.id }, data: {
      approvedQuantity: approved,
      approvedFromStockQuantity: fromStock,
      approvedForProcurementQuantity: forProcurement,
      approvedById: input.actorId,
      approvedAt: now,
      approvalRemarks: input.remarks?.trim() || null,
    } })
    if (demand.state === "SUBMITTED") await tx.demand.update({ where: { id: demand.id }, data: { state: "ACTIVE", startedAt: now, startedById: input.actorId } })
    await tx.auditLog.create({ data: {
      userId: input.actorId, userName: input.actorName, action: "APPROVE_DEMAND_LINE", entityType: "DemandLine", entityId: line.id,
      details: JSON.stringify({ requested: line.requiredQuantity.toString(), approved: approved.toString(), fromStock: fromStock.toString(), forProcurement: forProcurement.toString(), remarks: input.remarks?.trim() || null }),
    } })
    await refreshDemandState(tx, demand.id, input.actorId)
    return updated
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function issueDemand(input: { demandId: string; actorId: string; actorName: string; idempotencyKey?: string; remarks?: string; lines: Array<{ demandLineId: string; quantity: Prisma.Decimal.Value; remarks?: string }> }) {
  if (!input.lines.length) throw new DomainError("ISSUE_LINES_REQUIRED", "At least one issue row is required")
  if (new Set(input.lines.map(row => row.demandLineId)).size !== input.lines.length) throw new DomainError("DUPLICATE_ISSUE_LINE", "Each demand row may appear only once in an issue")
  return db.$transaction(async tx => {
    if (input.idempotencyKey) {
      const found = await tx.demandIssue.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } })
      if (found) {
        const requested = new Map(input.lines.map(row => [row.demandLineId, row]))
        const sameLines = found.lines.length === input.lines.length && found.lines.every(line => {
          const row = requested.get(line.demandLineId)
          if (!row) return false
          try { return line.quantity.eq(dec(row.quantity)) && textValue(line.remarks) === textValue(row.remarks) } catch { return false }
        })
        if (found.demandId !== input.demandId || textValue(found.remarks) !== textValue(input.remarks) || !sameLines) {
          throw new DomainError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used with different issue details", 409)
        }
        return found
      }
    }
    const demand = await tx.demand.findUnique({ where: { id: input.demandId } })
    if (!demand || ["CLOSED", "CANCELLED"].includes(demand.state)) throw new DomainError("DEMAND_NOT_OPEN", "Demand is not open")
    const issue = await tx.demandIssue.create({ data: { issueNo: "ISS-" + Date.now() + "-" + Math.floor(Math.random()*1000), demandId: input.demandId, postedById: input.actorId, idempotencyKey: input.idempotencyKey, remarks: input.remarks } })
    const auditLines: Array<{ demandLineId: string; itemId: string; quantity: string; onHandAfter: string }> = []
    for (const row of input.lines) {
      const amount = dec(row.quantity)
      if (amount.lte(0)) throw new DomainError("INVALID_QUANTITY", "Issue quantity must be positive")
      const q = await quantities(tx, row.demandLineId)
      if (!q.line.itemId || q.line.demandId !== input.demandId) throw new DomainError("INVALID_DEMAND_LINE", "Row does not belong to this demand")
      if (!q.line.approvedAt) throw new DomainError("DEMAND_NOT_APPROVED", "Approve this demand row before issuing stock")
      const stock = await balance(tx, q.line.itemId)
      if (amount.gt(q.allocated)) throw new DomainError("INSUFFICIENT_ALLOCATION", "Issue only from the quantity approved from stock")
      if (amount.gt(q.remaining)) throw new DomainError("OVER_ISSUE", "Quantity exceeds the remaining approved demand")
      if (amount.gt(stock.onHand) || amount.gt(stock.reserved)) throw new DomainError("INSUFFICIENT_STOCK", "Stock or reservation is insufficient")
      const issueLine = await tx.demandIssueLine.create({ data: { issueId: issue.id, demandLineId: q.line.id, itemId: q.line.itemId, quantity: amount, remarks: row.remarks } })
      const after = stock.onHand.minus(amount)
      await tx.itemBalance.update({ where: { itemId: q.line.itemId }, data: { onHand: after, reserved: { decrement: amount }, version: { increment: 1 } } })
      await tx.inventoryLedgerEntry.create({ data: { itemId: q.line.itemId, type: "ISSUE", quantity: amount.negated(), onHandAfter: after, sourceType: "DEMAND_ISSUE", sourceId: issue.id, sourceLineId: issueLine.id, actorId: input.actorId, remarks: row.remarks } })
      auditLines.push({ demandLineId: q.line.id, itemId: q.line.itemId, quantity: amount.toString(), onHandAfter: after.toString() })
    }
    await tx.auditLog.create({ data: { userId: input.actorId, userName: input.actorName, action: "POST_DEMAND_ISSUE", entityType: "DemandIssue", entityId: issue.id, details: JSON.stringify({ issueNo: issue.issueNo, demandId: input.demandId, lines: auditLines }) } })
    await refreshDemandState(tx, input.demandId, input.actorId)
    return tx.demandIssue.findUnique({ where: { id: issue.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function returnIssuedStock(input: { actorId: string; actorName: string; idempotencyKey?: string; reason?: string; remarks?: string; lines: Array<{ issueLineId: string; quantity: Prisma.Decimal.Value; disposition: "REPLACEMENT_REQUIRED" | "REDUCE_APPROVED_QUANTITY"; remarks?: string }> }) {
  if (!input.lines.length) throw new DomainError("RETURN_LINES_REQUIRED", "At least one return row is required")
  const reason = input.reason?.trim()
  if (!reason) throw new DomainError("RETURN_REASON_REQUIRED", "A reason is required for every return")
  if (new Set(input.lines.map(row => row.issueLineId)).size !== input.lines.length) throw new DomainError("DUPLICATE_RETURN_LINE", "Each issue row may appear only once in a return")
  return db.$transaction(async tx => {
    if (input.idempotencyKey) {
      const found = await tx.demandReturn.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } })
      if (found) {
        const requested = new Map(input.lines.map(row => [row.issueLineId, row]))
        const sameLines = found.lines.length === input.lines.length && found.lines.every(line => {
          const row = requested.get(line.issueLineId)
          if (!row) return false
          try { return line.quantity.eq(dec(row.quantity)) && line.disposition === row.disposition && textValue(line.remarks) === textValue(row.remarks) } catch { return false }
        })
        if (textValue(found.reason) !== reason || textValue(found.remarks) !== textValue(input.remarks) || !sameLines) {
          throw new DomainError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used with different return details", 409)
        }
        return found
      }
    }
    const header = await tx.demandReturn.create({ data: { returnNo: "RET-" + Date.now() + "-" + Math.floor(Math.random()*1000), postedById: input.actorId, idempotencyKey: input.idempotencyKey, reason, remarks: input.remarks } })
    const auditLines: Array<{ issueLineId: string; quantity: string; disposition: string; onHandAfter: string }> = []
    const affectedDemandIds = new Set<string>()
    for (const row of input.lines) {
      const amount = dec(row.quantity)
      if (!['REPLACEMENT_REQUIRED', 'REDUCE_APPROVED_QUANTITY'].includes(row.disposition)) throw new DomainError("INVALID_RETURN_DISPOSITION", "Choose whether replacement is still required")
      const original = await tx.demandIssueLine.findUnique({ where: { id: row.issueLineId }, include: { returnLines: true, demandLine: { select: { demandId: true } } } })
      if (!original) throw new DomainError("ISSUE_LINE_NOT_FOUND", "Issue row was not found", 404)
      const previous = original.returnLines.reduce((sum, x) => sum.plus(x.quantity), dec(0))
      if (amount.lte(0) || previous.plus(amount).gt(original.quantity)) throw new DomainError("OVER_RETURN", "Return exceeds the net issued quantity")
      const stock = await balance(tx, original.itemId)
      const line = await tx.demandReturnLine.create({ data: { returnId: header.id, issueLineId: original.id, itemId: original.itemId, quantity: amount, disposition: row.disposition, remarks: row.remarks } })
      const after = stock.onHand.plus(amount)
      await tx.itemBalance.update({ where: { itemId: original.itemId }, data: { onHand: after, reserved: row.disposition === "REPLACEMENT_REQUIRED" ? { increment: amount } : undefined, version: { increment: 1 } } })
      await tx.inventoryLedgerEntry.create({ data: { itemId: original.itemId, type: "RETURN", quantity: amount, onHandAfter: after, sourceType: "DEMAND_RETURN", sourceId: header.id, sourceLineId: line.id, actorId: input.actorId, remarks: row.remarks } })
      if (row.disposition === "REDUCE_APPROVED_QUANTITY") {
        await tx.demandApprovalRevision.create({ data: {
          demandLineId: original.demandLineId, type: "RETURN_NO_REPLACEMENT", approvedQuantityDelta: amount.negated(), fromStockQuantityDelta: amount.negated(), forProcurementQuantityDelta: 0,
          returnLineId: line.id, sourceId: `return-disposition-${line.id}`, reason, createdById: input.actorId,
        } })
      }
      affectedDemandIds.add(original.demandLine.demandId)
      auditLines.push({ issueLineId: original.id, quantity: amount.toString(), disposition: row.disposition, onHandAfter: after.toString() })
    }
    await tx.auditLog.create({ data: { userId: input.actorId, userName: input.actorName, action: "POST_DEMAND_RETURN", entityType: "DemandReturn", entityId: header.id, details: JSON.stringify({ returnNo: header.returnNo, reason, lines: auditLines }) } })
    for (const demandId of affectedDemandIds) await refreshDemandState(tx, demandId, input.actorId)
    return tx.demandReturn.findUnique({ where: { id: header.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function adjustInventory(input: {
  actorId: string
  actorName: string
  idempotencyKey?: string
  reason?: string
  remarks?: string
  lines: Array<{ itemId: string; quantity: Prisma.Decimal.Value; remarks?: string }>
}) {
  const reason = input.reason?.trim()
  if (!reason) throw new DomainError("ADJUSTMENT_REASON_REQUIRED", "A reason is required for every stock adjustment")
  if (!Array.isArray(input.lines) || !input.lines.length) throw new DomainError("ADJUSTMENT_LINES_REQUIRED", "At least one stock adjustment row is required")
  if (input.lines.length > 100) throw new DomainError("TOO_MANY_ADJUSTMENT_LINES", "A stock adjustment may contain at most 100 rows")
  if (new Set(input.lines.map(row => row.itemId)).size !== input.lines.length) {
    throw new DomainError("DUPLICATE_ADJUSTMENT_ITEM", "Each component may appear only once in a stock adjustment")
  }

  return db.$transaction(async tx => {
    if (input.idempotencyKey) {
      const found = await tx.inventoryAdjustment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } })
      if (found) return found
    }

    const header = await tx.inventoryAdjustment.create({ data: {
      adjustmentNo: "ADJ-" + Date.now() + "-" + Math.floor(Math.random() * 1000).toString().padStart(3, "0"),
      postedById: input.actorId,
      idempotencyKey: input.idempotencyKey,
      reason,
      remarks: input.remarks?.trim() || null,
    } })

    const auditLines: Array<{ itemId: string; quantity: string; onHandAfter: string }> = []
    for (const row of input.lines) {
      if (!row.itemId?.trim()) throw new DomainError("ITEM_REQUIRED", "Every stock adjustment row needs a component")
      let amount: Prisma.Decimal
      try { amount = dec(row.quantity) } catch { throw new DomainError("INVALID_QUANTITY", "Adjustment quantity is invalid") }
      if (amount.eq(0)) throw new DomainError("INVALID_QUANTITY", "Adjustment quantity cannot be zero")

      const item = await tx.item.findUnique({ where: { id: row.itemId }, select: { id: true } })
      if (!item) throw new DomainError("ITEM_NOT_FOUND", "The selected component was not found", 404)
      const stock = await balance(tx, item.id)
      const after = stock.onHand.plus(amount)
      if (after.lt(0)) throw new DomainError("ADJUSTMENT_BELOW_ZERO", "Stock reduction would make on-hand stock negative")
      if (after.lt(stock.reserved)) {
        throw new DomainError("ADJUSTMENT_BELOW_COMMITTED", "Stock reduction would remove inventory already reserved for open demand")
      }

      const lineRemarks = row.remarks?.trim() || null
      const ledgerRemarks = [reason, input.remarks?.trim(), lineRemarks].filter(Boolean).join(" — ")
      const line = await tx.inventoryAdjustmentLine.create({ data: {
        adjustmentId: header.id,
        itemId: item.id,
        quantity: amount,
        remarks: lineRemarks,
      } })
      await tx.itemBalance.update({ where: { itemId: item.id }, data: { onHand: after, version: { increment: 1 } } })
      await tx.inventoryLedgerEntry.create({ data: {
        itemId: item.id,
        type: amount.gt(0) ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
        quantity: amount,
        onHandAfter: after,
        sourceType: "INVENTORY_ADJUSTMENT",
        sourceId: header.id,
        sourceLineId: line.id,
        actorId: input.actorId,
        remarks: ledgerRemarks,
      } })
      auditLines.push({ itemId: item.id, quantity: amount.toString(), onHandAfter: after.toString() })
    }

    await tx.auditLog.create({ data: {
      userId: input.actorId,
      userName: input.actorName,
      action: "POST_INVENTORY_ADJUSTMENT",
      entityType: "InventoryAdjustment",
      entityId: header.id,
      details: JSON.stringify({ adjustmentNo: header.adjustmentNo, reason, remarks: input.remarks?.trim() || null, lines: auditLines }),
    } })
    return tx.inventoryAdjustment.findUnique({ where: { id: header.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export function apiError(error: unknown) {
  if (error instanceof DomainError) return Response.json({ error: error.message, code: error.code }, { status: error.status })
  console.error(error)
  return Response.json({ error: "Unexpected server error", code: "INTERNAL_ERROR" }, { status: 500 })
}
