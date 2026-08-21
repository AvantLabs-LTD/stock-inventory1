import test from "node:test"
import assert from "node:assert/strict"
import * as XLSX from "xlsx"
import { parseInventoryMaster } from "../../src/lib/inventory-master-import"

test("inventory master parser ignores Assemblies and normalizes stock and connector units", () => {
  const workbook = XLSX.utils.book_new()
  const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name)
  add("Metal Connectors", [["Metal Connectors"], ["Sr/No", "Name", "Qty/26", "In Stock"], [1, "J30J-51ZKN", 26, null]])
  add("Mechanical", [["Mechanical Items"], ["Sr/No", "Items", "Size", "Specs", "In Store"], [1, "CLS", "M3-1", null, -78]])
  add("Assemblies", [["Assemblies"], ["Item", "Specs", "Qty/26", "Instock"], ["Heat Sink", "Rectifier Top", 26, 15]])
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer
  const parsed = parseInventoryMaster(bytes)
  assert.equal(parsed.candidates.length, 2)
  assert.equal(parsed.candidates.find(row => row.sheet === "Metal Connectors")?.unit, "pcs")
  assert.equal(parsed.candidates.find(row => row.sheet === "Metal Connectors")?.openingStock, 0)
  assert.equal(parsed.candidates.find(row => row.sheet === "Mechanical")?.openingStock, 0)
  assert.deepEqual(parsed.summary.ignoredSheets, ["Assemblies"])
  assert.equal(parsed.summary.blankStockRows, 1)
  assert.equal(parsed.summary.negativeStockRows, 1)
})
