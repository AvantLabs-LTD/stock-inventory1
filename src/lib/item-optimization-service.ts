import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"
import { DomainError, apiError } from "@/lib/inventory-service"
import { runSerializable } from "@/lib/transaction"
import { requestHash, normalizeIdempotencyKey, replayOrStartIdempotentRequest, completeIdempotentRequest } from "@/lib/idempotency"

type Tx = Prisma.TransactionClient
type Actor = { id: string; name: string }
const id = z.string().min(1).max(100)
const snapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const itemSelect = { id: true, code: true, title: true, specification: true, unit: true, discipline: true, status: true } as const
const versionInclude = { bom: { include: { projectTag: true } }, lines: { include: { applicability: { orderBy: { tag: "asc" as const } }, item: { select: itemSelect } }, orderBy: { id: "asc" as const } } } as const
type Version = Prisma.BomVersionGetPayload<{ include: typeof versionInclude }>
export const standardizeSchema = z.object({ groupId: id, targetItemId: id, lineIds: z.array(id).min(1).max(1000), reason: z.string().trim().min(1).max(2000) }).strict()
export const mergeSchema = z.object({ sourceItemId: id, targetItemId: id, moveBalance: z.boolean(), moveBomLines: z.boolean(), moveOpenDemand: z.boolean(), moveOpenPurchases: z.boolean(), copySupplierLinks: z.boolean(), reason: z.string().trim().min(1).max(2000) }).strict()
export const groupSchema = z.object({ name: z.string().trim().min(1).max(250), description: z.string().trim().max(2000).nullable().optional(), itemIds: z.array(id).min(2).max(100) }).strict()

function fail(code: string, message: string): never { throw new DomainError(code, message, 409) }
function compatible(a: {unit:string;discipline:string}, b: {unit:string;discipline:string}) { return a.unit === b.unit && a.discipline === b.discipline }
async function audit(tx: Tx, actor: Actor, action: string, entityType: string, entityId: string, details: unknown) {
  await tx.auditLog.create({ data: { userId: actor.id, userName: actor.name, action, entityType, entityId, rootEntityType: entityType, rootEntityId: entityId, details: JSON.stringify(details) } })
}
export function optimizationError(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ code: "INVALID_INPUT", error: error.issues.map(row => row.message).join("; ") }, { status: 400 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: "CONFLICT", error: "This record already exists. Refresh and review." }, { status: 409 })
  return apiError(error)
}

// Only deliberate memberships are persisted. Discovery scores never enter this service.
export async function saveAlternativeGroup(raw: unknown, actor: Actor, groupId?: string) {
  const input = groupSchema.parse(raw)
  if (new Set(input.itemIds).size !== input.itemIds.length) fail("DUPLICATE_ITEM", "Select each component once")
  return runSerializable(async tx => {
    const items = await tx.item.findMany({ where: { id: { in: input.itemIds }, status: "ACTIVE" }, select: itemSelect })
    if (items.length !== input.itemIds.length) fail("ITEM_UNAVAILABLE", "Every member must be an active component")
    if (items.some(item => !compatible(item, items[0]))) fail("UNIT_MISMATCH", "Alternative components must have the same unit and discipline")
    const before = groupId ? await tx.itemAlternativeGroup.findUnique({ where: { id: groupId }, include: { memberships: true } }) : null
    if (groupId && !before) fail("GROUP_NOT_FOUND", "Alternative group was not found")
    const group = groupId
      ? await tx.itemAlternativeGroup.update({ where: { id: groupId }, data: { name: input.name, description: input.description || null } })
      : await tx.itemAlternativeGroup.create({ data: { name: input.name, description: input.description || null, createdById: actor.id } })
    if (groupId) await tx.itemAlternativeMembership.deleteMany({ where: { groupId } })
    await tx.itemAlternativeMembership.createMany({ data: input.itemIds.map(itemId => ({ groupId: group.id, itemId })) })
    await audit(tx, actor, groupId ? "UPDATE_ITEM_ALTERNATIVE_GROUP" : "CREATE_ITEM_ALTERNATIVE_GROUP", "ItemAlternativeGroup", group.id, { before, after: input })
    return group
  })
}

export async function deleteAlternativeGroup(groupId: string, actor: Actor) {
  return runSerializable(async tx => {
    const before = await tx.itemAlternativeGroup.findUnique({ where: { id: groupId }, include: { memberships: true } })
    if (!before) fail("GROUP_NOT_FOUND", "Alternative group was not found")
    await tx.itemAlternativeGroup.delete({ where: { id: groupId } })
    await audit(tx, actor, "DELETE_ITEM_ALTERNATIVE_GROUP", "ItemAlternativeGroup", groupId, { before })
  })
}

export async function alternativeOccurrences(groupId: string, page = 1) {
  const members = await db.itemAlternativeMembership.findMany({ where: { groupId } })
  return db.bomLine.findMany({ where: { itemId: { in: members.map(row => row.itemId) }, bomVersion: { status: { in: ["ACTIVE", "DRAFT"] }, bom: { status: "ACTIVE" } } }, include: { item: { select: itemSelect }, bomVersion: { include: { bom: { include: { projectTag: true } } } } }, orderBy: [{ bomVersionId: "asc" }, { sortOrder: "asc" }, { id: "asc" }], skip: (page - 1) * 500, take: 501 })
}

async function standardizeState(tx: Tx, input: z.infer<typeof standardizeSchema>) {
  if (new Set(input.lineIds).size !== input.lineIds.length) fail("DUPLICATE_LINE", "Select each BOM line once")
  const group = await tx.itemAlternativeGroup.findUnique({ where: { id: input.groupId }, include: { memberships: { orderBy: { itemId: "asc" } } } })
  if (!group || !group.memberships.some(row => row.itemId === input.targetItemId)) fail("INVALID_ALTERNATIVE", "The selected replacement must belong to this group")
  const target = await tx.item.findUniqueOrThrow({ where: { id: input.targetItemId }, select: itemSelect })
  if (target.status !== "ACTIVE") fail("ITEM_UNAVAILABLE", "Choose an active replacement component")
  const versions = await tx.bomVersion.findMany({ where: { lines: { some: { id: { in: input.lineIds } } } }, include: versionInclude, orderBy: { id: "asc" } })
  if (versions.length > 30) fail("TOO_MANY_BOMS", "Review at most 30 BOM revisions per operation")
  const selected = versions.flatMap(version => version.lines.filter(line => input.lineIds.includes(line.id)))
  if (selected.length !== input.lineIds.length) fail("LINE_NOT_FOUND", "Some BOM lines are no longer available")
  for (const version of versions) {
    if (!["ACTIVE", "DRAFT"].includes(version.status) || version.bom.status !== "ACTIVE") fail("BOM_CHANGED", "A source BOM is no longer available. Refresh the review.")
    for (const line of version.lines.filter(row => input.lineIds.includes(row.id))) {
      if (!group.memberships.some(row => row.itemId === line.itemId) || line.itemId === target.id) fail("INVALID_ALTERNATIVE", "Select lines containing other members of the group")
      if (!compatible(line.item, target) || (line.unit && line.unit !== target.unit)) fail("UNIT_MISMATCH", "Replacement unit and discipline must match each selected line")
    }
  }
  return { group, target, versions }
}

async function cloneVersion(tx: Tx, base: Version, replacements: Map<string,string>, actor: Actor, reason: string) {
  const version = await tx.bomVersion.create({ data: { bomId: base.bomId, revision: `optimization-${randomUUID()}`, status: "DRAFT", effectiveFrom: base.effectiveFrom, effectiveTo: base.effectiveTo, createdById: actor.id } })
  const ids = new Map(base.lines.map(line => [line.id, randomUUID()]))
  // Two passes preserve arbitrary hierarchy order, including parents after children.
  for (const line of base.lines) await tx.bomLine.create({ data: { id: ids.get(line.id), bomVersionId: version.id, itemId: replacements.get(line.id) || line.itemId, sourceLineKey: line.sourceLineKey, quantity: line.quantity, unit: line.unit, scrapAllowance: line.scrapAllowance, consumptionRouteStepId: line.consumptionRouteStepId, notes: line.notes, sortOrder: line.sortOrder, applicability: { create: line.applicability.map(row => ({ tag: row.tag, quantity: row.quantity })) } } })
  for (const line of base.lines) if (line.parentLineId) {
    const parentLineId = ids.get(line.parentLineId)
    if (!parentLineId) fail("INVALID_HIERARCHY", "Source BOM has a missing parent")
    await tx.bomLine.update({ where: { id: ids.get(line.id)! }, data: { parentLineId } })
  }
  await audit(tx, actor, "OPTIMIZATION_BOM_DRAFT_CREATE", "BomVersion", version.id, { baseVersionId: base.id, reason, replacements: base.lines.filter(line => replacements.has(line.id)).map(line => ({ sourceLineId: line.id, newLineId: ids.get(line.id), sourceLineKey: line.sourceLineKey, beforeItemId: line.itemId, afterItemId: replacements.get(line.id) })), lineMapping: Object.fromEntries(ids) })
  return { id: version.id, bomId: version.bomId, revision: version.revision, name: base.bom.name }
}

export async function previewStandardization(raw: unknown) {
  const input = standardizeSchema.parse(raw)
  return runSerializable(async tx => {
    const state = await standardizeState(tx, input)
    return { token: requestHash("standardize", snapshot({ input, state })), revisions: state.versions.map(version => ({ id: version.id, name: version.bom.name, revision: version.revision, project: version.bom.projectTag?.name, changes: version.lines.filter(line => input.lineIds.includes(line.id)).map(line => ({ id: line.id, sourceLineKey: line.sourceLineKey, from: line.item.title, to: state.target.title, quantity: line.quantity.toString() })) })) }
  })
}

async function consequential<T>(action: string, input: unknown, actor: Actor, key: string, work: (tx: Tx) => Promise<T>) {
  const normalized = normalizeIdempotencyKey(key)
  if (!normalized) throw new DomainError("IDEMPOTENCY_REQUIRED", "An idempotency key is required")
  return runSerializable(async tx => {
    const replay = await replayOrStartIdempotentRequest(tx, { actorId: actor.id, key: normalized, action, payload: input })
    if (replay) return replay as unknown as T
    const result = await work(tx)
    await completeIdempotentRequest(tx, { actorId: actor.id, key: normalized, response: result })
    return result
  }, { timeout: 60000 })
}

export async function commitStandardization(raw: unknown, token: string, actor: Actor, key: string) {
  const input = standardizeSchema.parse(raw)
  return consequential("item.standardize", { input, token }, actor, key, async tx => {
    const state = await standardizeState(tx, input)
    if (token !== requestHash("standardize", snapshot({ input, state }))) fail("STALE_PREVIEW", "BOMs or alternatives changed. Review a fresh preview.")
    const replacements = new Map(input.lineIds.map(lineId => [lineId, input.targetItemId]))
    const revisions: Awaited<ReturnType<typeof cloneVersion>>[] = []
    for (const base of state.versions) revisions.push(await cloneVersion(tx, base, replacements, actor, input.reason))
    return { revisions }
  })
}

async function mergeState(tx: Tx, input: z.infer<typeof mergeSchema>) {
  if (input.sourceItemId === input.targetItemId) fail("SAME_ITEM", "Source and survivor must be different")
  const items = await tx.item.findMany({ where: { id: { in: [input.sourceItemId, input.targetItemId] } }, include: { balance: true, supplierLinks: { orderBy: { id: "asc" } }, mergeSources: true } })
  const source = items.find(row => row.id === input.sourceItemId), target = items.find(row => row.id === input.targetItemId)
  if (!source || !target || source.status !== "ACTIVE" || target.status !== "ACTIVE" || source.mergeSources.length || target.mergeSources.length) fail("ITEM_UNAVAILABLE", "Choose two active, unmerged components")
  if (!compatible(source, target)) fail("UNIT_MISMATCH", "Merge requires identical units and discipline")
  const demands = await tx.demandLine.findMany({ where: { itemId: source.id, demand: { state: { in: ["SUBMITTED", "ACTIVE"] } } }, include: { demand: true, issueLines: true, approvalRevisions: true, purchaseLinks: { include: { purchaseRequestLine: { include: { purchaseRequest: true, receiptLines: true } } } } }, orderBy: { id: "asc" } })
  const purchases = await tx.purchaseRequestLine.findMany({ where: { itemId: source.id, purchaseRequest: { status: { not: "RECEIVED_IN_STORE" } } }, include: { purchaseRequest: true, receiptLines: true, demandLinks: true }, orderBy: { id: "asc" } })
  const movablePurchases = purchases.filter(row => row.purchaseRequest.status === "BACKLOG" && !row.receiptLines.length)
  const movableDemands = demands.filter(row => !row.issueLines.length && row.purchaseLinks.every(link => movablePurchases.some(p => p.id === link.purchaseRequestLineId)))
  const demandIds = new Set(input.moveOpenDemand ? movableDemands.map(row => row.id) : [])
  const purchaseIds = new Set(input.moveOpenPurchases ? movablePurchases.map(row => row.id) : [])
  const blockers: string[] = []
  for (const row of movableDemands.filter(row => demandIds.has(row.id))) if (row.purchaseLinks.some(link => !purchaseIds.has(link.purchaseRequestLineId))) blockers.push(`Move backlog purchases together with demand ${row.demand.demandNo} to preserve coverage links.`)
  for (const row of movablePurchases.filter(row => purchaseIds.has(row.id))) if (row.demandLinks.some(link => !demandIds.has(link.demandLineId))) blockers.push(`Purchase ${row.purchaseRequest.requestNo} has coverage that cannot move with the selected demands.`)
  const allocated = movableDemands.filter(row => demandIds.has(row.id)).reduce((sum, row) => sum.plus(Prisma.Decimal.max(new Prisma.Decimal(row.approvedFromStockQuantity || 0).plus(row.approvalRevisions.reduce((n, rev) => n.plus(rev.fromStockQuantityDelta), new Prisma.Decimal(0))), 0)), new Prisma.Decimal(0))
  const sourceOnHand = new Prisma.Decimal(source.balance?.onHand || 0), targetOnHand = new Prisma.Decimal(target.balance?.onHand || 0)
  const sourceReserved = new Prisma.Decimal(source.balance?.reserved || 0), targetReserved = new Prisma.Decimal(target.balance?.reserved || 0)
  const transferred = input.moveBalance ? sourceOnHand : new Prisma.Decimal(0)
  if (sourceReserved.minus(allocated).lt(0)) blockers.push("Allocation cache is inconsistent; rebuild it before merging.")
  if (sourceOnHand.minus(transferred).lt(sourceReserved.minus(allocated))) blockers.push("Stock is still allocated to retained demands. Keep the stock on the source item or resolve those demands first.")
  if (targetOnHand.plus(transferred).lt(targetReserved.plus(allocated))) blockers.push("The survivor would have insufficient stock for the transferred allocations.")
  const versions = input.moveBomLines ? await tx.bomVersion.findMany({ where: { status: { in: ["ACTIVE", "DRAFT"] }, bom: { status: "ACTIVE" }, lines: { some: { itemId: source.id } } }, include: versionInclude, orderBy: { id: "asc" } }) : []
  if (versions.length > 30) blockers.push("More than 30 BOM revisions are affected. Standardize BOMs in smaller batches first.")
  if (versions.some(version => version.lines.some(line => line.itemId === source.id && line.unit && line.unit !== target.unit))) blockers.push("A BOM line uses a different unit. Reconcile its unit before merging.")
  const result = { source, target, demands, purchases, versions, allocated: allocated.toString(), transferred: transferred.toString(), demandIds: [...demandIds], purchaseIds: [...purchaseIds], blockers: [...new Set(blockers)] }
  return result
}

export async function previewMerge(raw: unknown) {
  const input = mergeSchema.parse(raw)
  return runSerializable(async tx => {
    const s = await mergeState(tx, input)
    return { token: requestHash("merge", snapshot({ input, state: s })), source: { id: s.source.id, code: s.source.code, title: s.source.title }, target: { id: s.target.id, code: s.target.code, title: s.target.title }, blockers: s.blockers, transfer: s.transferred, allocations: s.allocated, retainedStock: new Prisma.Decimal(s.source.balance?.onHand || 0).minus(s.transferred).toString(), demands: s.demands.map(row => ({ id: row.id, name: row.demand.demandNo, move: s.demandIds.includes(row.id) })), purchases: s.purchases.map(row => ({ id: row.id, name: row.purchaseRequest.requestNo, move: s.purchaseIds.includes(row.id) })), revisions: s.versions.map(row => ({ id: row.id, name: row.bom.name, revision: row.revision })), supplierLinks: input.copySupplierLinks ? s.source.supplierLinks.length : 0 }
  })
}

export async function commitMerge(raw: unknown, token: string, actor: Actor, key: string) {
  const input = mergeSchema.parse(raw)
  return consequential("item.merge", { input, token }, actor, key, async tx => {
    // Match stock workflows' row locking and deterministic lock order.
    for (const itemId of [input.sourceItemId, input.targetItemId].sort()) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "items" WHERE "id"=${itemId} FOR UPDATE`)
      await tx.$queryRaw(Prisma.sql`SELECT "itemId" FROM "item_balances" WHERE "itemId"=${itemId} FOR UPDATE`)
    }
    const s = await mergeState(tx, input)
    if (token !== requestHash("merge", snapshot({ input, state: s }))) fail("STALE_PREVIEW", "Components, quantities or references changed. Review a fresh preview.")
    if (s.blockers.length) fail("MERGE_BLOCKED", s.blockers.join(" "))
    const merge = await tx.itemMerge.create({ data: { sourceItemId: input.sourceItemId, targetItemId: input.targetItemId, moveBalance: input.moveBalance, moveBomLines: input.moveBomLines, moveOpenDemand: input.moveOpenDemand, moveOpenPurchases: input.moveOpenPurchases, remarks: input.reason, mergedById: actor.id } })
    await tx.demandLine.updateMany({ where: { id: { in: s.demandIds } }, data: { itemId: s.target.id } })
    await tx.purchaseRequestLine.updateMany({ where: { id: { in: s.purchaseIds } }, data: { itemId: s.target.id } })
    const amount = new Prisma.Decimal(s.transferred), allocated = new Prisma.Decimal(s.allocated)
    const adjustment = amount.gt(0) ? await tx.inventoryAdjustment.create({ data: { adjustmentNo: `MERGE-${merge.id}`, postedById: actor.id, reason: input.reason, remarks: `Component merge ${s.source.code} → ${s.target.code}` } }) : null
    for (const [item, delta, reservedDelta] of [[s.source, amount.negated(), allocated.negated()], [s.target, amount, allocated]] as const) {
      const after = new Prisma.Decimal(item.balance?.onHand || 0).plus(delta), reserved = new Prisma.Decimal(item.balance?.reserved || 0).plus(reservedDelta)
      await tx.itemBalance.upsert({ where: { itemId: item.id }, create: { itemId: item.id, onHand: after, reserved }, update: { onHand: after, reserved, version: { increment: 1 } } })
      if (adjustment) {
        const line = await tx.inventoryAdjustmentLine.create({ data: { adjustmentId: adjustment.id, itemId: item.id, quantity: delta, remarks: input.reason } })
        await tx.inventoryLedgerEntry.create({ data: { itemId: item.id, type: delta.gt(0) ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", quantity: delta, onHandAfter: after, sourceType: "INVENTORY_ADJUSTMENT", sourceId: adjustment.id, sourceLineId: line.id, actorId: actor.id, remarks: `Merge ${merge.id}: ${input.reason}` } })
      }
    }
    const revisions: Awaited<ReturnType<typeof cloneVersion>>[] = []
    for (const version of s.versions) revisions.push(await cloneVersion(tx, version, new Map(version.lines.filter(line => line.itemId === s.source.id).map(line => [line.id, s.target.id])), actor, input.reason))
    const copiedLinks: Array<{sourceId:string;targetId:string}> = []
    if (input.copySupplierLinks) for (const link of s.source.supplierLinks) {
      if (s.target.supplierLinks.some(row => row.url === link.url)) continue // preserve both originals and never overwrite target metadata
      const { id: oldId, itemId: _itemId, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = link
      const created = await tx.itemSupplierLink.create({ data: { ...data, itemId: s.target.id } })
      copiedLinks.push({ sourceId: oldId, targetId: created.id })
    }
    await tx.item.update({ where: { id: s.source.id }, data: { status: "ARCHIVED" } })
    const details = { decisions: input, before: snapshot(s), revisions, copiedLinks, adjustmentId: adjustment?.id || null, sourceArchived: true }
    await audit(tx, actor, "MERGE_ITEM", "Item", s.source.id, details)
    await audit(tx, actor, "MERGE_ITEM_SURVIVOR", "Item", s.target.id, { mergeId: merge.id, ...details })
    return { mergeId: merge.id, revisions, sourceItemId: s.source.id, targetItemId: s.target.id }
  })
}
