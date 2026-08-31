import { createHash } from "node:crypto"
import { Prisma } from "@prisma/client"
import type { InventoryMasterCandidate } from "@/lib/inventory-master-import"

export const RECONCILABLE_ITEM_FIELDS = [
  "title",
  "specification",
  "manufacturerName",
  "manufacturerPartNumber",
  "supplierPartNumber",
  "unit",
  "remarks",
] as const

export type ReconcilableItemField = typeof RECONCILABLE_ITEM_FIELDS[number]

export type InventoryMasterDiffEntry = {
  baseline: InventoryMasterCandidate | null
  current: InventoryMasterCandidate
  baselineSourceKey: string | null
  metadataChanges: Array<{ field: ReconcilableItemField; before: string | null; after: string | null }>
  stockChanged: boolean
  bomRequiredChanged: boolean
}

export type InventoryMasterDiff = {
  entries: InventoryMasterDiffEntry[]
  removed: InventoryMasterCandidate[]
  summary: {
    newItems: number
    metadataItems: number
    metadataFieldChanges: number
    stockChanges: number
    bomRequiredChanges: number
    removedItems: number
  }
}

const text = (value: string | null | undefined) => value ?? null
const decimalEqual = (left: number | null, right: number | null) => {
  if (left == null || right == null) return left === right
  return new Prisma.Decimal(left).eq(right)
}

export function buildInventoryMasterDiff(
  baselineCandidates: InventoryMasterCandidate[],
  currentCandidates: InventoryMasterCandidate[],
): InventoryMasterDiff {
  const baselineBySourceKey = new Map(baselineCandidates.map(row => [row.sourceKey, row]))
  const matchedBaselineKeys = new Set<string>()
  const entries: InventoryMasterDiffEntry[] = []

  for (const current of currentCandidates) {
    const matchKeys = [current.sourceKey, ...current.legacySourceKeys]
    const baseline = matchKeys.map(key => baselineBySourceKey.get(key)).find(Boolean) || null
    if (baseline) matchedBaselineKeys.add(baseline.sourceKey)
    const metadataChanges = baseline
      ? RECONCILABLE_ITEM_FIELDS.flatMap(field => text(baseline[field]) === text(current[field])
        ? []
        : [{ field, before: text(baseline[field]), after: text(current[field]) }])
      : []
    const stockChanged = Boolean(
      baseline
      && baseline.observedStock != null
      && current.observedStock != null
      && !decimalEqual(baseline.observedStock, current.observedStock),
    )
    const bomRequiredChanged = Boolean(
      baseline
      && baseline.bomRequiredQuantity != null
      && current.bomRequiredQuantity != null
      && !decimalEqual(baseline.bomRequiredQuantity, current.bomRequiredQuantity),
    )
    if (!baseline || metadataChanges.length || stockChanged || bomRequiredChanged || baseline.sourceKey !== current.sourceKey) {
      entries.push({ baseline, current, baselineSourceKey: baseline?.sourceKey || null, metadataChanges, stockChanged, bomRequiredChanged })
    }
  }

  const removed = baselineCandidates.filter(row => !matchedBaselineKeys.has(row.sourceKey))
  return {
    entries,
    removed,
    summary: {
      newItems: entries.filter(entry => !entry.baseline).length,
      metadataItems: entries.filter(entry => entry.metadataChanges.length > 0).length,
      metadataFieldChanges: entries.reduce((count, entry) => count + entry.metadataChanges.length, 0),
      stockChanges: entries.filter(entry => entry.stockChanged).length,
      bomRequiredChanges: entries.filter(entry => entry.bomRequiredChanged).length,
      removedItems: removed.length,
    },
  }
}

export function reconciliationFileHash(buffer: ArrayBuffer) {
  return createHash("sha256").update(new Uint8Array(buffer)).digest("hex")
}

export function reconciliationPlanHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}
