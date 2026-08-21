import { createHash } from "node:crypto"
import * as XLSX from "xlsx"
import type { ItemDiscipline } from "@prisma/client"

export type InventoryMasterCandidate = {
  sourceKey: string
  code: string
  sheet: string
  discipline: ItemDiscipline
  categoryName: string
  familyName: string | null
  title: string
  specification: string | null
  manufacturerName: string | null
  manufacturerPartNumber: string | null
  supplierPartNumber: string | null
  unit: string
  openingStock: number
  remarks: string | null
}

const clean = (value: unknown) => value == null ? null : String(value).replace(/\s+/g, " ").trim() || null
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase()
const nonNegativeStock = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
const stableCode = (sourceKey: string) => `IMP-${createHash("sha256").update(sourceKey).digest("hex").slice(0, 12).toUpperCase()}`

function candidate(input: Omit<InventoryMasterCandidate, "sourceKey" | "code" | "openingStock"> & { stock: unknown }) {
  const identity = [input.sheet, input.title, input.specification, input.manufacturerPartNumber, input.supplierPartNumber].map(value => normalize(value || "")).join("|")
  const sourceKey = `inventory-master:${identity}`
  return { ...input, sourceKey, code: stableCode(sourceKey), openingStock: nonNegativeStock(input.stock) }
}

export function parseInventoryMaster(buffer: ArrayBuffer): { candidates: InventoryMasterCandidate[]; summary: { bySheet: Record<string, number>; blankStockRows: number; negativeStockRows: number; ignoredSheets: string[] } } {
  const workbook = XLSX.read(buffer, { type: "array" })
  const candidates: InventoryMasterCandidate[] = []
  let blankStockRows = 0
  let negativeStockRows = 0
  const add = (row: ReturnType<typeof candidate>, rawStock: unknown) => {
    if (rawStock == null || rawStock === "") blankStockRows += 1
    if (typeof rawStock === "number" && rawStock < 0) negativeStockRows += 1
    candidates.push(row)
  }
  const rows = (name: string) => {
    const actualName = workbook.SheetNames.find(sheetName => normalize(sheetName) === normalize(name))
    const sheet = actualName ? workbook.Sheets[actualName] : undefined
    return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true }) : []
  }

  let family: string | null = null
  for (const row of rows("Aux").slice(2)) {
    if (clean(row[1])) family = clean(row[1])
    const specification = clean(row[2])
    if (!family && !specification) continue
    add(candidate({ sheet: "Aux", discipline: "ELECTRONICS", categoryName: "Auxiliary & Harness Supplies", familyName: family, title: family || specification!, specification, manufacturerName: null, manufacturerPartNumber: null, supplierPartNumber: null, unit: clean(row[3]) || "pcs", stock: row[4], remarks: clean(row[5]) }), row[4])
  }

  for (const row of rows("Metal Connectors").slice(2)) {
    const title = clean(row[1]); if (!title) continue
    add(candidate({ sheet: "Metal Connectors", discipline: "ELECTRONICS", categoryName: "Metal Connectors", familyName: null, title, specification: null, manufacturerName: null, manufacturerPartNumber: null, supplierPartNumber: null, unit: "pcs", stock: row[3], remarks: clean(row[5]) }), row[3])
  }

  family = null
  for (const row of rows("Mechanical").slice(2)) {
    if (clean(row[1])) family = clean(row[1])
    const size = clean(row[2]); if (!size) continue
    const specification = [size, clean(row[3])].filter(Boolean).join(" — ")
    add(candidate({ sheet: "Mechanical", discipline: "MECHANICAL", categoryName: "Standard Mechanical Hardware", familyName: family, title: family || size, specification, manufacturerName: null, manufacturerPartNumber: null, supplierPartNumber: null, unit: "pcs", stock: row[4], remarks: clean(row[5]) }), row[4])
  }

  family = null
  for (const row of rows("Local Mfr Mech").slice(2)) {
    if (clean(row[1])) family = clean(row[1])
    const specification = clean(row[2]); if (!specification) continue
    add(candidate({ sheet: "Local Mfr Mech", discipline: "MECHANICAL", categoryName: "Locally Manufactured Mechanical Parts", familyName: family, title: family || specification, specification, manufacturerName: null, manufacturerPartNumber: null, supplierPartNumber: null, unit: "pcs", stock: row[3], remarks: clean(row[4]) }), row[3])
  }

  for (const row of rows("PCBs").slice(2)) {
    const title = clean(row[1]); if (!title) continue
    add(candidate({ sheet: "PCBs", discipline: "ELECTRONICS", categoryName: "PCBs", familyName: null, title, specification: null, manufacturerName: null, manufacturerPartNumber: null, supplierPartNumber: null, unit: "pcs", stock: row[2], remarks: null }), row[2])
  }

  family = null
  for (const row of rows("SMD Components").slice(2)) {
    if (clean(row[1])) family = clean(row[1])
    const specification = clean(row[2]), manufacturerPartNumber = clean(row[4])
    if (!specification && !manufacturerPartNumber) continue
    add(candidate({ sheet: "SMD Components", discipline: "ELECTRONICS", categoryName: "PCB Components", familyName: family, title: specification || manufacturerPartNumber!, specification, manufacturerName: clean(row[3]), manufacturerPartNumber, supplierPartNumber: clean(row[5]), unit: "pcs", stock: null, remarks: null }), null)
  }

  const bySheet: Record<string, number> = {}
  for (const row of candidates) bySheet[row.sheet] = (bySheet[row.sheet] || 0) + 1
  const visibility = new Map((workbook.Workbook?.Sheets || []).map(sheet => [normalize(sheet.name || ""), sheet.Hidden || 0]))
  const ignoredSheets = workbook.SheetNames.filter(name => visibility.get(normalize(name)) !== 0 || normalize(name) === "assemblies")
  return { candidates, summary: { bySheet, blankStockRows, negativeStockRows, ignoredSheets } }
}
