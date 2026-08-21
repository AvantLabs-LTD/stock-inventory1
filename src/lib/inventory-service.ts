import { Prisma, PrismaClient, ProcurementType } from "@prisma/client"
import { db } from "@/lib/db"

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]
const dec = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v)

export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}

export const normalizeName = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase()

async function quantities(tx: Tx, lineId: string) {
  const line = await tx.demandLine.findUnique({ where: { id: lineId } })
  if (!line) throw new DomainError("DEMAND_LINE_NOT_FOUND", "Demand row was not found", 404)
  const [entries, allocated, returned, cancellations] = await Promise.all([
    tx.demandReservationEntry.findMany({ where: { demandLineId: lineId } }),
    tx.demandAllocationLine.aggregate({ where: { demandLineId: lineId }, _sum: { quantity: true } }),
    tx.demandReturnLine.aggregate({ where: { allocationLine: { demandLineId: lineId } }, _sum: { quantity: true } }),
    tx.demandLineCancellation.aggregate({ where: { demandLineId: lineId }, _sum: { quantity: true } }),
  ])
  const reservedGross = entries.reduce((n, e) => e.type === "RESERVE" ? n.plus(e.quantity) : n.minus(e.quantity), dec(0))
  const allocatedGross = allocated._sum.quantity || dec(0)
  const returnedQty = returned._sum.quantity || dec(0)
  const cancelled = cancellations._sum.quantity || dec(0)
  const netAllocated = Prisma.Decimal.max(allocatedGross.minus(returnedQty), 0)
  return {
    line,
    reserved: Prisma.Decimal.max(reservedGross.minus(allocatedGross), 0),
    allocated: netAllocated,
    remaining: Prisma.Decimal.max(line.requiredQuantity.minus(cancelled).minus(netAllocated), 0),
  }
}

async function balance(tx: Tx, itemId: string) {
  return tx.itemBalance.upsert({ where: { itemId }, update: {}, create: { itemId } })
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

export async function reserveLine(input: { lineId: string; quantity: Prisma.Decimal.Value; actorId: string; sourceId: string; remarks?: string }) {
  const amount = dec(input.quantity)
  if (amount.lte(0)) throw new DomainError("INVALID_QUANTITY", "Reservation quantity must be positive")
  return db.$transaction(async tx => {
    const found = await tx.demandReservationEntry.findUnique({ where: { sourceId: input.sourceId } })
    if (found) return found
    const q = await quantities(tx, input.lineId)
    if (!q.line.itemId) throw new DomainError("ITEM_RECONCILIATION_REQUIRED", "Link this row to an item before reserving")
    const demand = await tx.demand.findUnique({ where: { id: q.line.demandId } })
    if (!demand || ["CLOSED", "CANCELLED"].includes(demand.state)) throw new DomainError("DEMAND_NOT_OPEN", "Demand is not open")
    const stock = await balance(tx, q.line.itemId)
    if (amount.gt(q.remaining.minus(q.reserved))) throw new DomainError("OVER_RESERVATION", "Quantity exceeds unreserved demand")
    if (amount.gt(stock.onHand.minus(stock.reserved))) throw new DomainError("INSUFFICIENT_FREE_STOCK", "Not enough free stock")
    const entry = await tx.demandReservationEntry.create({ data: { demandLineId: q.line.id, type: "RESERVE", quantity: amount, sourceId: input.sourceId, createdById: input.actorId, remarks: input.remarks } })
    await tx.itemBalance.update({ where: { itemId: q.line.itemId }, data: { reserved: { increment: amount }, version: { increment: 1 } } })
    if (demand.state === "SUBMITTED") await tx.demand.update({ where: { id: demand.id }, data: { state: "ACTIVE", startedAt: new Date(), startedById: input.actorId } })
    return entry
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function releaseLine(input: { lineId: string; quantity: Prisma.Decimal.Value; actorId: string; sourceId: string; remarks?: string }) {
  const amount = dec(input.quantity)
  if (amount.lte(0)) throw new DomainError("INVALID_QUANTITY", "Release quantity must be positive")
  return db.$transaction(async tx => {
    const found = await tx.demandReservationEntry.findUnique({ where: { sourceId: input.sourceId } })
    if (found) return found
    const q = await quantities(tx, input.lineId)
    if (!q.line.itemId) throw new DomainError("ITEM_RECONCILIATION_REQUIRED", "Row is not linked to an item")
    if (amount.gt(q.reserved)) throw new DomainError("OVER_RELEASE", "Quantity exceeds this row's reservation")
    const entry = await tx.demandReservationEntry.create({ data: { demandLineId: q.line.id, type: "RELEASE", quantity: amount, sourceId: input.sourceId, createdById: input.actorId, remarks: input.remarks } })
    await tx.itemBalance.update({ where: { itemId: q.line.itemId }, data: { reserved: { decrement: amount }, version: { increment: 1 } } })
    return entry
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function allocateDemand(input: { demandId: string; actorId: string; idempotencyKey?: string; remarks?: string; lines: Array<{ demandLineId: string; quantity: Prisma.Decimal.Value; remarks?: string }> }) {
  if (!input.lines.length) throw new DomainError("ALLOCATION_LINES_REQUIRED", "At least one allocation row is required")
  return db.$transaction(async tx => {
    if (input.idempotencyKey) {
      const found = await tx.demandAllocation.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } })
      if (found) return found
    }
    const demand = await tx.demand.findUnique({ where: { id: input.demandId } })
    if (!demand || ["CLOSED", "CANCELLED"].includes(demand.state)) throw new DomainError("DEMAND_NOT_OPEN", "Demand is not open")
    const allocation = await tx.demandAllocation.create({ data: { allocationNo: "ALC-" + Date.now() + "-" + Math.floor(Math.random()*1000), demandId: input.demandId, postedById: input.actorId, idempotencyKey: input.idempotencyKey, remarks: input.remarks } })
    for (const row of input.lines) {
      const amount = dec(row.quantity)
      if (amount.lte(0)) throw new DomainError("INVALID_QUANTITY", "Allocation quantity must be positive")
      const q = await quantities(tx, row.demandLineId)
      if (!q.line.itemId || q.line.demandId !== input.demandId) throw new DomainError("INVALID_DEMAND_LINE", "Row does not belong to this demand")
      const stock = await balance(tx, q.line.itemId)
      if (amount.gt(q.reserved)) throw new DomainError("INSUFFICIENT_RESERVATION", "Allocate only from reserved stock")
      if (amount.gt(q.remaining)) throw new DomainError("OVER_ALLOCATION", "Quantity exceeds remaining demand")
      if (amount.gt(stock.onHand) || amount.gt(stock.reserved)) throw new DomainError("INSUFFICIENT_STOCK", "Stock or reservation is insufficient")
      const allocationLine = await tx.demandAllocationLine.create({ data: { allocationId: allocation.id, demandLineId: q.line.id, itemId: q.line.itemId, quantity: amount, remarks: row.remarks } })
      const after = stock.onHand.minus(amount)
      await tx.itemBalance.update({ where: { itemId: q.line.itemId }, data: { onHand: after, reserved: { decrement: amount }, version: { increment: 1 } } })
      await tx.inventoryLedgerEntry.create({ data: { itemId: q.line.itemId, type: "ALLOCATION", quantity: amount.negated(), onHandAfter: after, sourceType: "DEMAND_ALLOCATION", sourceId: allocation.id, sourceLineId: allocationLine.id, actorId: input.actorId, remarks: row.remarks } })
    }
    return tx.demandAllocation.findUnique({ where: { id: allocation.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function returnAllocation(input: { actorId: string; idempotencyKey?: string; reason?: string; remarks?: string; lines: Array<{ allocationLineId: string; quantity: Prisma.Decimal.Value; remarks?: string }> }) {
  if (!input.lines.length) throw new DomainError("RETURN_LINES_REQUIRED", "At least one return row is required")
  return db.$transaction(async tx => {
    if (input.idempotencyKey) {
      const found = await tx.demandReturn.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } })
      if (found) return found
    }
    const header = await tx.demandReturn.create({ data: { returnNo: "RET-" + Date.now() + "-" + Math.floor(Math.random()*1000), postedById: input.actorId, idempotencyKey: input.idempotencyKey, reason: input.reason, remarks: input.remarks } })
    for (const row of input.lines) {
      const amount = dec(row.quantity)
      const original = await tx.demandAllocationLine.findUnique({ where: { id: row.allocationLineId }, include: { returnLines: true } })
      if (!original) throw new DomainError("ALLOCATION_LINE_NOT_FOUND", "Allocation row was not found", 404)
      const previous = original.returnLines.reduce((sum, x) => sum.plus(x.quantity), dec(0))
      if (amount.lte(0) || previous.plus(amount).gt(original.quantity)) throw new DomainError("OVER_RETURN", "Return exceeds net allocated quantity")
      const stock = await balance(tx, original.itemId)
      const line = await tx.demandReturnLine.create({ data: { returnId: header.id, allocationLineId: original.id, itemId: original.itemId, quantity: amount, remarks: row.remarks } })
      const after = stock.onHand.plus(amount)
      await tx.itemBalance.update({ where: { itemId: original.itemId }, data: { onHand: after, version: { increment: 1 } } })
      await tx.inventoryLedgerEntry.create({ data: { itemId: original.itemId, type: "RETURN", quantity: amount, onHandAfter: after, sourceType: "DEMAND_RETURN", sourceId: header.id, sourceLineId: line.id, actorId: input.actorId, remarks: row.remarks } })
    }
    return tx.demandReturn.findUnique({ where: { id: header.id }, include: { lines: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export function apiError(error: unknown) {
  if (error instanceof DomainError) return Response.json({ error: error.message, code: error.code }, { status: error.status })
  console.error(error)
  return Response.json({ error: "Unexpected server error", code: "INTERNAL_ERROR" }, { status: 500 })
}
