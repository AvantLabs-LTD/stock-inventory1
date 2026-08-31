import { Prisma, PrismaClient } from "@prisma/client"
import { db } from "@/lib/db"
import { DomainError, normalizeName } from "@/lib/inventory-service"
import type { InventoryMasterCandidate } from "@/lib/inventory-master-import"
import {
  buildInventoryMasterDiff,
  reconciliationPlanHash,
  type InventoryMasterDiff,
  type InventoryMasterDiffEntry,
  type ReconcilableItemField,
} from "@/lib/inventory-master-reconciliation"

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]
type DbLike = PrismaClient | Tx
type InventoryAdjustmentWithLines = Prisma.InventoryAdjustmentGetPayload<{ include: { lines: true } }>

type ItemSnapshot = {
  id: string
  code: string
  importSourceKey: string | null
  title: string
  specification: string | null
  manufacturerName: string | null
  manufacturerPartNumber: string | null
  supplierPartNumber: string | null
  unit: string
  remarks: string | null
  balance: { onHand: Prisma.Decimal; reserved: Prisma.Decimal } | null
}

export type InventoryMasterReconciliationPlan = {
  planHash: string
  fileHash: string
  summary: {
    newItems: number
    metadataItems: number
    stockAdjustments: number
    bomRequiredChanges: number
    removedItemsIgnored: number
    conflicts: number
  }
  newItems: Array<{
    sourceKey: string
    title: string
    specification: string | null
    sheet: string
    sourceRow: number
    targetStock: string | null
  }>
  metadataUpdates: Array<{
    itemId: string
    code: string
    title: string
    sheet: string
    sourceRow: number
    changes: Array<{ field: ReconcilableItemField | "importSourceKey"; before: string | null; after: string | null }>
  }>
  stockAdjustments: Array<{
    itemId: string
    code: string
    title: string
    sheet: string
    sourceRow: number
    currentOnHand: string
    reserved: string
    targetOnHand: string
    adjustment: string
  }>
  bomRequiredChanges: Array<{
    sourceKey: string
    title: string
    manufacturerPartNumber: string | null
    sourceRow: number
    before: string
    after: string
    change: string
    disposition: "NOT_POSTED_AS_STOCK"
  }>
  conflicts: Array<{ code: string; sourceKey: string; title: string; message: string }>
}

const itemSelect = {
  id: true,
  code: true,
  importSourceKey: true,
  title: true,
  specification: true,
  manufacturerName: true,
  manufacturerPartNumber: true,
  supplierPartNumber: true,
  unit: true,
  remarks: true,
  balance: { select: { onHand: true, reserved: true } },
} satisfies Prisma.ItemSelect

const sameText = (left: string | null | undefined, right: string | null | undefined) => (left ?? null) === (right ?? null)
const dec = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value)

function findItem(entry: InventoryMasterDiffEntry, bySourceKey: Map<string, ItemSnapshot>) {
  const keys = [entry.current.sourceKey, entry.baselineSourceKey, ...entry.current.legacySourceKeys].filter(Boolean) as string[]
  return keys.map(key => bySourceKey.get(key)).find(Boolean) || null
}

async function preparePlan(database: DbLike, diff: InventoryMasterDiff, fileHash: string, lockBalances: boolean) {
  const lookupKeys = [...new Set(diff.entries.flatMap(entry => [
    entry.current.sourceKey,
    entry.baselineSourceKey,
    ...entry.current.legacySourceKeys,
  ].filter(Boolean) as string[]))]
  const items = await database.item.findMany({ where: { importSourceKey: { in: lookupKeys } }, select: itemSelect }) as ItemSnapshot[]
  const bySourceKey = new Map(items.flatMap(item => item.importSourceKey ? [[item.importSourceKey, item] as const] : []))
  const newItems: InventoryMasterReconciliationPlan["newItems"] = []
  const metadataUpdates: InventoryMasterReconciliationPlan["metadataUpdates"] = []
  const stockAdjustments: InventoryMasterReconciliationPlan["stockAdjustments"] = []
  const bomRequiredChanges: InventoryMasterReconciliationPlan["bomRequiredChanges"] = []
  const conflicts: InventoryMasterReconciliationPlan["conflicts"] = []

  const stockItemIds = diff.entries.filter(entry => entry.stockChanged).flatMap(entry => {
    const item = findItem(entry, bySourceKey)
    return item ? [item.id] : []
  })
  if (lockBalances && stockItemIds.length) {
    await database.$queryRaw(Prisma.sql`SELECT "itemId" FROM "item_balances" WHERE "itemId" IN (${Prisma.join(stockItemIds)}) FOR UPDATE`)
    const refreshed = await database.item.findMany({ where: { id: { in: stockItemIds } }, select: itemSelect }) as ItemSnapshot[]
    for (const item of refreshed) if (item.importSourceKey) bySourceKey.set(item.importSourceKey, item)
  }

  for (const entry of diff.entries) {
    const current = entry.current
    const item = findItem(entry, bySourceKey)
    if (!entry.baseline) {
      if (item) continue
      newItems.push({
        sourceKey: current.sourceKey,
        title: current.title,
        specification: current.specification,
        sheet: current.sheet,
        sourceRow: current.sourceRow,
        targetStock: current.observedStock == null ? null : dec(current.observedStock).toString(),
      })
      continue
    }
    if (!item) {
      conflicts.push({
        code: "IMPORTED_ITEM_NOT_FOUND",
        sourceKey: entry.baseline.sourceKey,
        title: current.title,
        message: `The existing imported component from ${current.sheet} row ${current.sourceRow} was not found in the store.`,
      })
      continue
    }

    const changes: InventoryMasterReconciliationPlan["metadataUpdates"][number]["changes"] = []
    for (const change of entry.metadataChanges) {
      const live = item[change.field]
      if (sameText(live, change.after)) continue
      if (!sameText(live, change.before)) {
        conflicts.push({
          code: "MANUAL_METADATA_CONFLICT",
          sourceKey: current.sourceKey,
          title: current.title,
          message: `${change.field} was changed manually in the store and no longer matches the approved baseline.`,
        })
        continue
      }
      changes.push(change)
    }
    if (item.importSourceKey !== current.sourceKey) {
      if (item.importSourceKey === entry.baselineSourceKey || current.legacySourceKeys.includes(item.importSourceKey || "")) {
        changes.push({ field: "importSourceKey", before: item.importSourceKey, after: current.sourceKey })
      } else {
        conflicts.push({
          code: "SOURCE_KEY_CONFLICT",
          sourceKey: current.sourceKey,
          title: current.title,
          message: "The component import identity no longer matches either the baseline or Aug 27 workbook.",
        })
      }
    }
    if (changes.length) metadataUpdates.push({
      itemId: item.id,
      code: item.code,
      title: current.title,
      sheet: current.sheet,
      sourceRow: current.sourceRow,
      changes,
    })

    if (entry.stockChanged && current.observedStock != null) {
      const onHand = item.balance?.onHand || dec(0)
      const reserved = item.balance?.reserved || dec(0)
      const target = dec(current.observedStock)
      const adjustment = target.minus(onHand)
      if (target.lt(reserved)) {
        conflicts.push({
          code: "TARGET_BELOW_RESERVED",
          sourceKey: current.sourceKey,
          title: current.title,
          message: `Target stock ${target.toString()} is below reserved stock ${reserved.toString()}.`,
        })
      } else if (!adjustment.eq(0)) {
        stockAdjustments.push({
          itemId: item.id,
          code: item.code,
          title: current.title,
          sheet: current.sheet,
          sourceRow: current.sourceRow,
          currentOnHand: onHand.toString(),
          reserved: reserved.toString(),
          targetOnHand: target.toString(),
          adjustment: adjustment.toString(),
        })
      }
    }

    if (entry.bomRequiredChanged && entry.baseline.bomRequiredQuantity != null && current.bomRequiredQuantity != null) {
      const before = dec(entry.baseline.bomRequiredQuantity)
      const after = dec(current.bomRequiredQuantity)
      bomRequiredChanges.push({
        sourceKey: current.sourceKey,
        title: current.title,
        manufacturerPartNumber: current.manufacturerPartNumber,
        sourceRow: current.sourceRow,
        before: before.toString(),
        after: after.toString(),
        change: after.minus(before).toString(),
        disposition: "NOT_POSTED_AS_STOCK",
      })
    }
  }

  const hashInput = { fileHash, newItems, metadataUpdates, stockAdjustments, bomRequiredChanges, conflicts, removed: diff.removed.map(row => row.sourceKey) }
  const planHash = reconciliationPlanHash(hashInput)
  return {
    planHash,
    fileHash,
    summary: {
      newItems: newItems.length,
      metadataItems: metadataUpdates.length,
      stockAdjustments: stockAdjustments.length,
      bomRequiredChanges: bomRequiredChanges.length,
      removedItemsIgnored: diff.removed.length,
      conflicts: conflicts.length,
    },
    newItems,
    metadataUpdates,
    stockAdjustments,
    bomRequiredChanges,
    conflicts,
  } satisfies InventoryMasterReconciliationPlan
}

export async function previewInventoryMasterReconciliation(input: {
  baselineCandidates: InventoryMasterCandidate[]
  currentCandidates: InventoryMasterCandidate[]
  fileHash: string
}) {
  const diff = buildInventoryMasterDiff(input.baselineCandidates, input.currentCandidates)
  return preparePlan(db, diff, input.fileHash, false)
}

export async function commitInventoryMasterReconciliation(input: {
  baselineCandidates: InventoryMasterCandidate[]
  currentCandidates: InventoryMasterCandidate[]
  fileHash: string
  expectedPlanHash: string
  fileName: string
  actorId: string
  actorName: string
}) {
  const idempotencyKey = `inventory-master-reconcile:${input.fileHash}`
  return db.$transaction(async tx => {
    const alreadyCommitted = await tx.inventoryAdjustment.findUnique({ where: { idempotencyKey }, include: { lines: true } })
    if (alreadyCommitted) return { alreadyCommitted: true, adjustment: alreadyCommitted }

    const diff = buildInventoryMasterDiff(input.baselineCandidates, input.currentCandidates)
    const plan = await preparePlan(tx, diff, input.fileHash, true)
    if (plan.planHash !== input.expectedPlanHash) {
      throw new DomainError("RECONCILIATION_PLAN_CHANGED", "Live store data changed after preview. Preview again before committing.", 409)
    }
    if (plan.conflicts.length) {
      throw new DomainError("RECONCILIATION_CONFLICT", "Resolve all reconciliation conflicts before committing.", 409)
    }

    const roots = await tx.itemCategory.findMany({ where: { parentId: null } })
    const rootByName = new Map(roots.map(category => [normalizeName(category.name), category]))
    const currentBySourceKey = new Map(input.currentCandidates.map(row => [row.sourceKey, row]))
    const createdItemIds = new Map<string, string>()
    for (const action of plan.newItems) {
      const row = currentBySourceKey.get(action.sourceKey)!
      const root = rootByName.get(normalizeName(row.categoryName))
      if (!root) throw new DomainError("IMPORT_CATEGORY_MISSING", `Missing catalogue category: ${row.categoryName}`)
      let categoryId = root.id
      if (row.familyName) {
        const normalizedName = normalizeName(row.familyName)
        categoryId = (await tx.itemCategory.upsert({
          where: { parentId_normalizedName: { parentId: root.id, normalizedName } },
          update: { name: row.familyName, discipline: row.discipline, status: "ACTIVE" },
          create: { name: row.familyName, normalizedName, discipline: row.discipline, parentId: root.id },
        })).id
      }
      const item = await tx.item.create({ data: {
        code: row.code,
        importSourceKey: row.sourceKey,
        title: row.title,
        discipline: row.discipline,
        categoryId,
        catalogueState: "COMPLETE",
        specification: row.specification,
        manufacturerName: row.manufacturerName,
        manufacturerPartNumber: row.manufacturerPartNumber,
        supplierPartNumber: row.supplierPartNumber,
        unit: row.unit,
        remarks: row.remarks,
        createdById: input.actorId,
        balance: { create: {} },
      } })
      createdItemIds.set(row.sourceKey, item.id)
    }

    for (const action of plan.metadataUpdates) {
      const data: Prisma.ItemUpdateInput = {}
      for (const change of action.changes) {
        switch (change.field) {
          case "importSourceKey":
            data.importSourceKey = change.after
            break
          case "title":
            if (change.after == null) throw new DomainError("IMPORT_TITLE_MISSING", "An imported component title cannot be empty.")
            data.title = change.after
            break
          case "unit":
            if (change.after == null) throw new DomainError("IMPORT_UNIT_MISSING", "An imported component unit cannot be empty.")
            data.unit = change.after
            break
          case "specification":
            data.specification = change.after
            break
          case "manufacturerName":
            data.manufacturerName = change.after
            break
          case "manufacturerPartNumber":
            data.manufacturerPartNumber = change.after
            break
          case "supplierPartNumber":
            data.supplierPartNumber = change.after
            break
          case "remarks":
            data.remarks = change.after
            break
        }
      }
      await tx.item.update({ where: { id: action.itemId }, data })
    }

    let adjustment: InventoryAdjustmentWithLines | null = null
    if (plan.stockAdjustments.length) {
      const header = await tx.inventoryAdjustment.create({ data: {
        adjustmentNo: "ADJ-" + Date.now() + "-" + Math.floor(Math.random() * 1000).toString().padStart(3, "0"),
        postedById: input.actorId,
        idempotencyKey,
        reason: "Approved Aug 27 master BOM reconciliation",
        remarks: `Reconciled to counted quantities in ${input.fileName}`,
      } })
      for (const action of plan.stockAdjustments) {
        const amount = dec(action.adjustment)
        const target = dec(action.targetOnHand)
        const line = await tx.inventoryAdjustmentLine.create({ data: {
          adjustmentId: header.id,
          itemId: action.itemId,
          quantity: amount,
          remarks: `${action.sheet} row ${action.sourceRow}: counted stock ${target.toString()}`,
        } })
        await tx.itemBalance.update({ where: { itemId: action.itemId }, data: { onHand: target, version: { increment: 1 } } })
        await tx.inventoryLedgerEntry.create({ data: {
          itemId: action.itemId,
          type: amount.gt(0) ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          quantity: amount,
          onHandAfter: target,
          sourceType: "INVENTORY_ADJUSTMENT",
          sourceId: header.id,
          sourceLineId: line.id,
          actorId: input.actorId,
          remarks: `Approved Aug 27 master BOM reconciliation — ${action.sheet} row ${action.sourceRow}`,
        } })
      }
      adjustment = await tx.inventoryAdjustment.findUnique({ where: { id: header.id }, include: { lines: true } })
    }

    await tx.auditLog.create({ data: {
      userId: input.actorId,
      userName: input.actorName,
      action: "RECONCILE_INVENTORY_MASTER",
      entityType: "InventoryMaster",
      entityId: input.fileHash,
      details: JSON.stringify({
        fileName: input.fileName,
        fileHash: input.fileHash,
        planHash: plan.planHash,
        summary: plan.summary,
        createdItemIds: Object.fromEntries(createdItemIds),
        bomRequiredDisposition: "Not posted as physical stock; canonical project BOM version storage is not yet available in this deployment.",
      }),
    } })
    return { alreadyCommitted: false, plan, adjustment }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 })
}
