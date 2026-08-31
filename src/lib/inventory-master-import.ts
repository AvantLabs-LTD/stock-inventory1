import { createHash } from "node:crypto"
import * as XLSX from "xlsx"
import type { ItemDiscipline } from "@prisma/client"

export type InventoryMasterCandidate = {
  sourceKey: string
  legacySourceKeys: string[]
  code: string
  sheet: string
  sourceRow: number
  discipline: ItemDiscipline
  categoryName: string
  familyName: string | null
  title: string
  specification: string | null
  manufacturerName: string | null
  manufacturerPartNumber: string | null
  supplierPartNumber: string | null
  unit: string
  observedStock: number | null
  openingStock: number
  bomRequiredQuantity: number | null
  remarks: string | null
}

type CandidateInput = Omit<InventoryMasterCandidate,
  "sourceKey" | "legacySourceKeys" | "code" | "observedStock" | "openingStock" | "bomRequiredQuantity"
> & {
  stock: unknown
  stockColumnPresent: boolean
  bomRequiredQuantity?: unknown
  legacyIdentities?: Array<{ title: string; specification?: string | null }>
}

const clean = (value: unknown) => value == null ? null : String(value).replace(/\s+/g, " ").trim() || null
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase()
const normalizeHeader = (value: unknown) => normalize(clean(value) || "").replace(/[^a-z0-9]+/g, " ").trim()
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null
const nonNegativeStock = (value: unknown) => {
  const amount = numeric(value)
  return amount != null && amount > 0 ? amount : 0
}
const stableCode = (sourceKey: string) => `IMP-${createHash("sha256").update(sourceKey).digest("hex").slice(0, 12).toUpperCase()}`

function identityKey(input: { sheet: string; title: string; specification?: string | null; manufacturerPartNumber?: string | null; supplierPartNumber?: string | null }) {
  const identity = [input.sheet, input.title, input.specification, input.manufacturerPartNumber, input.supplierPartNumber]
    .map(value => normalize(value || ""))
    .join("|")
  return `inventory-master:${identity}`
}

function candidate(input: CandidateInput): InventoryMasterCandidate {
  const sourceKey = identityKey(input)
  const observed = input.stockColumnPresent ? Math.max(numeric(input.stock) || 0, 0) : null
  const legacySourceKeys = (input.legacyIdentities || [])
    .map(identity => identityKey({ ...input, title: identity.title, specification: identity.specification }))
    .filter(key => key !== sourceKey)
  return {
    ...input,
    sourceKey,
    legacySourceKeys: [...new Set(legacySourceKeys)],
    code: stableCode(sourceKey),
    observedStock: observed,
    openingStock: nonNegativeStock(input.stock),
    bomRequiredQuantity: numeric(input.bomRequiredQuantity),
  }
}

function headerMap(rows: unknown[][]): Map<string, number> {
  const header = rows[1] || []
  const entries = header.flatMap((value, index) => {
    const name = normalizeHeader(value)
    return name ? [[name, index] as const] : []
  })
  return new Map(entries)
}

function column(headers: Map<string, number>, names: string[], fallback?: number) {
  for (const name of names) {
    const found = headers.get(normalizeHeader(name))
    if (found != null) return found
  }
  return fallback
}

export function parseInventoryMaster(buffer: ArrayBuffer): {
  candidates: InventoryMasterCandidate[]
  summary: { bySheet: Record<string, number>; blankStockRows: number; negativeStockRows: number; ignoredSheets: string[] }
} {
  const workbook = XLSX.read(buffer, { type: "array" })
  const candidates: InventoryMasterCandidate[] = []
  let blankStockRows = 0
  let negativeStockRows = 0
  const add = (row: InventoryMasterCandidate, rawStock: unknown, stockColumnPresent: boolean) => {
    if (stockColumnPresent && (rawStock == null || rawStock === "")) blankStockRows += 1
    if (stockColumnPresent && typeof rawStock === "number" && rawStock < 0) negativeStockRows += 1
    candidates.push(row)
  }
  const rows = (name: string) => {
    const actualName = workbook.SheetNames.find(sheetName => normalize(sheetName) === normalize(name))
    const sheet = actualName ? workbook.Sheets[actualName] : undefined
    return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true }) : []
  }

  const auxRows = rows("Aux")
  const auxHeaders = headerMap(auxRows)
  const auxName = column(auxHeaders, ["Name"], 1)!
  const auxSpec = column(auxHeaders, ["Specs", "Specification"], 2)!
  const auxUnit = column(auxHeaders, ["A/U", "Unit"], 3)!
  const auxStock = column(auxHeaders, ["In Stock"])
  const auxRemarks = column(auxHeaders, ["Remarks"])
  let family: string | null = null
  for (const [offset, row] of auxRows.slice(2).entries()) {
    if (clean(row[auxName])) family = clean(row[auxName])
    const specification = clean(row[auxSpec])
    if (!family && !specification) continue
    const rawStock = auxStock == null ? null : row[auxStock]
    add(candidate({
      sheet: "Aux", sourceRow: offset + 3, discipline: "ELECTRONICS", categoryName: "Auxiliary & Harness Supplies",
      familyName: family, title: family || specification!, specification, manufacturerName: null, manufacturerPartNumber: null,
      supplierPartNumber: null, unit: clean(row[auxUnit]) || "pcs", stock: rawStock, stockColumnPresent: auxStock != null,
      remarks: auxRemarks == null ? null : clean(row[auxRemarks]),
    }), rawStock, auxStock != null)
  }

  const connectorRows = rows("Metal Connectors")
  const connectorHeaders = headerMap(connectorRows)
  const connectorName = column(connectorHeaders, ["Name"], 1)!
  const connectorStock = column(connectorHeaders, ["In Stock"])
  const connectorRemarks = column(connectorHeaders, ["Remarks"])
  for (const [offset, row] of connectorRows.slice(2).entries()) {
    const title = clean(row[connectorName]); if (!title) continue
    const rawStock = connectorStock == null ? null : row[connectorStock]
    add(candidate({
      sheet: "Metal Connectors", sourceRow: offset + 3, discipline: "ELECTRONICS", categoryName: "Metal Connectors",
      familyName: null, title, specification: null, manufacturerName: null, manufacturerPartNumber: null,
      supplierPartNumber: null, unit: "pcs", stock: rawStock, stockColumnPresent: connectorStock != null,
      remarks: connectorRemarks == null ? null : clean(row[connectorRemarks]),
    }), rawStock, connectorStock != null)
  }

  const mechanicalRows = rows("Mechanical")
  const mechanicalHeaders = headerMap(mechanicalRows)
  const mechanicalName = column(mechanicalHeaders, ["Items", "Item"], 1)!
  const mechanicalSize = column(mechanicalHeaders, ["Size"], 2)!
  const mechanicalSpecs = column(mechanicalHeaders, ["Specs", "Specification"], 3)!
  const mechanicalStock = column(mechanicalHeaders, ["In Store"])
  const mechanicalRemarks = column(mechanicalHeaders, ["Remarks"])
  family = null
  for (const [offset, row] of mechanicalRows.slice(2).entries()) {
    if (clean(row[mechanicalName])) family = clean(row[mechanicalName])
    const size = clean(row[mechanicalSize]); if (!size) continue
    const specification = [size, clean(row[mechanicalSpecs])].filter(Boolean).join(" — ")
    const rawStock = mechanicalStock == null ? null : row[mechanicalStock]
    add(candidate({
      sheet: "Mechanical", sourceRow: offset + 3, discipline: "MECHANICAL", categoryName: "Standard Mechanical Hardware",
      familyName: family, title: family || size, specification, manufacturerName: null, manufacturerPartNumber: null,
      supplierPartNumber: null, unit: "pcs", stock: rawStock, stockColumnPresent: mechanicalStock != null,
      remarks: mechanicalRemarks == null ? null : clean(row[mechanicalRemarks]),
    }), rawStock, mechanicalStock != null)
  }

  const localRows = rows("Local Mfr Mech")
  const localHeaders = headerMap(localRows)
  const localName = column(localHeaders, ["Item Name", "Item"], 1)!
  const localSpec = column(localHeaders, ["Specification", "Specs"], 2)!
  const localStock = column(localHeaders, ["Inventory", "In Stock"])
  const localRemarks = column(localHeaders, ["Remarks"])
  family = null
  for (const [offset, row] of localRows.slice(2).entries()) {
    if (clean(row[localName])) family = clean(row[localName])
    const specification = clean(row[localSpec]); if (!specification) continue
    const rawStock = localStock == null ? null : row[localStock]
    add(candidate({
      sheet: "Local Mfr Mech", sourceRow: offset + 3, discipline: "MECHANICAL", categoryName: "Locally Manufactured Mechanical Parts",
      familyName: family, title: family || specification, specification, manufacturerName: null, manufacturerPartNumber: null,
      supplierPartNumber: null, unit: "pcs", stock: rawStock, stockColumnPresent: localStock != null,
      remarks: localRemarks == null ? null : clean(row[localRemarks]),
    }), rawStock, localStock != null)
  }

  const pcbRows = rows("PCBs")
  const pcbHeaders = headerMap(pcbRows)
  const pcbName = column(pcbHeaders, ["Item Name", "Item"], 1)!
  const pcbSpec = column(pcbHeaders, ["Specification", "Specs"])
  const pcbStock = column(pcbHeaders, ["Inventory", "In Stock"])
  family = null
  for (const [offset, row] of pcbRows.slice(2).entries()) {
    if (clean(row[pcbName])) family = clean(row[pcbName])
    const specification = pcbSpec == null ? null : clean(row[pcbSpec])
    if (!family && !specification) continue
    const title = family || specification!
    const combinedTitle = [title, specification].filter(Boolean).join(" ")
    const legacyIdentities = specification
      ? [{ title: combinedTitle, specification: null }, ...(normalize(combinedTitle) === "filter cards v3" ? [{ title: "V3", specification: null }] : [])]
      : []
    const rawStock = pcbStock == null ? null : row[pcbStock]
    add(candidate({
      sheet: "PCBs", sourceRow: offset + 3, discipline: "ELECTRONICS", categoryName: "PCBs", familyName: null,
      title, specification, manufacturerName: null, manufacturerPartNumber: null, supplierPartNumber: null, unit: "pcs",
      stock: rawStock, stockColumnPresent: pcbStock != null, remarks: null, legacyIdentities,
    }), rawStock, pcbStock != null)
  }

  const smdRows = rows("SMD Components")
  const smdHeaders = headerMap(smdRows)
  const smdType = column(smdHeaders, ["Types", "Type"], 1)!
  const smdComment = column(smdHeaders, ["Comment", "Specification"], 2)!
  const smdManufacturer = column(smdHeaders, ["Manufacturer Name"], 3)!
  const smdMpn = column(smdHeaders, ["Manufacturer Part Number"], 4)!
  const smdSupplier = column(smdHeaders, ["LCSC Part No", "Supplier Part Number"], 5)!
  const smdRequired = column(smdHeaders, ["Qty Req", "Required Quantity"])
  family = null
  for (const [offset, row] of smdRows.slice(2).entries()) {
    if (clean(row[smdType])) family = clean(row[smdType])
    const specification = clean(row[smdComment]), manufacturerPartNumber = clean(row[smdMpn])
    if (!specification && !manufacturerPartNumber) continue
    add(candidate({
      sheet: "SMD Components", sourceRow: offset + 3, discipline: "ELECTRONICS", categoryName: "PCB Components",
      familyName: family, title: specification || manufacturerPartNumber!, specification,
      manufacturerName: clean(row[smdManufacturer]), manufacturerPartNumber, supplierPartNumber: clean(row[smdSupplier]),
      unit: "pcs", stock: null, stockColumnPresent: false, bomRequiredQuantity: smdRequired == null ? null : row[smdRequired], remarks: null,
    }), null, false)
  }

  const bySheet: Record<string, number> = {}
  for (const row of candidates) bySheet[row.sheet] = (bySheet[row.sheet] || 0) + 1
  const visibility = new Map((workbook.Workbook?.Sheets || []).map(sheet => [normalize(sheet.name || ""), sheet.Hidden || 0]))
  const ignoredSheets = workbook.SheetNames.filter(name => visibility.get(normalize(name)) !== 0 || normalize(name) === "assemblies")
  return { candidates, summary: { bySheet, blankStockRows, negativeStockRows, ignoredSheets } }
}
