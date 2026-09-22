import fs from "node:fs"
import path from "node:path"
import { Workbook, SpreadsheetFile } from "file:///C:/Users/max12/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs"
import XLSX from "xlsx"

const root = "D:/CSD Software/Store/BOMs"
const output = "docs/bom-unique-components-reconciliation.xlsx"
const recommendations = JSON.parse(fs.readFileSync("docs/bom-live-match-results.json", "utf8")).matches
const normal = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.xlsx$/i.test(entry.name) ? [path.join(dir, entry.name)] : [])
const candidates = []
for (const file of walk(root)) {
  const workbook = XLSX.readFile(file)
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false })
    const headerRow = rows.findIndex(row => row.some(cell => /comment|item name|part no|part name|connector|^item$/i.test(String(cell))))
    if (headerRow < 0) continue
    const headers = rows[headerRow].map(normal)
    const index = names => headers.findIndex(header => names.includes(header))
    const name = index(["comment", "item name", "part no", "part name", "connector", "item"])
    const specification = index(["specs", "specification", "description", "details"])
    const quantity = index(["quantity", "quantity per set", "qty set", "qty pet set"])
    const mpn = index(["manufacturer part number"])
    const supplier = index(["lcsc part no"])
    if (name < 0) continue
    rows.slice(headerRow + 1).forEach((row, offset) => {
      const title = String(row[name] || "").trim(); if (!title) return
      const spec = String(specification >= 0 ? row[specification] : "").trim()
      const manufacturerPartNumber = String(mpn >= 0 ? row[mpn] : "").trim()
      const supplierPartNumber = String(supplier >= 0 ? row[supplier] : "").trim()
      const identity = manufacturerPartNumber ? `MPN:${normal(manufacturerPartNumber)}` : supplierPartNumber ? `SUP:${normal(supplierPartNumber)}` : `${normal(title)}|${normal(spec)}`
      candidates.push({ identity, title, spec, manufacturerPartNumber, supplierPartNumber, quantity: String(quantity >= 0 ? row[quantity] : "").trim(), file: path.relative(root, file), sheetName, row: headerRow + offset + 2 })
    })
  }
}
const groups = [...new Map(candidates.map(row => [row.identity, []])).entries()].map(([identity]) => {
  const rows = candidates.filter(row => row.identity === identity)
  const first = rows[0], identities = new Set(rows.map(row => `${normal(row.title)}|${normal(row.spec)}`))
  const suggestion = recommendations[identity] || { code: "", title: "", strength: "NONE", reason: "No recommendation generated" }
  return [first.title, first.spec, first.manufacturerPartNumber, first.supplierPartNumber, rows.length, [...new Set(rows.map(row => row.file))].length, [...new Set(rows.map(row => `${row.file} · ${row.sheetName} · row ${row.row}`))].join("\n"), identities.size > 1 ? "REVIEW: same part identifier has differing descriptions" : first.manufacturerPartNumber || first.supplierPartNumber ? "Strong identifier — verify against store" : "Text-only — manual reconciliation required", suggestion.code, suggestion.title, suggestion.strength, suggestion.reason, ""]
}).sort((a, b) => String(a[0]).localeCompare(String(b[0])))

const wb = Workbook.create(); const sheet = wb.worksheets.add("Unique components")
sheet.showGridLines = false
sheet.getRange("A1:M1").merge(); sheet.getRange("A1").values = [["BOM component reconciliation — review only"]]
sheet.getRange("A2:M2").merge(); sheet.getRange("A2").values = [["Recommendations are suggestions from the live catalogue. Enter only approved existing Store Item Codes; leave uncertain rows blank."]]
const headers = [["Component", "Specification", "Manufacturer Part Number", "Supplier / LCSC Number", "Source Rows", "Source Files", "Source Provenance", "Reconciliation Guidance", "Recommended Code", "Recommended Store Item", "Match Strength", "Recommendation Reason", "Store Item Code"]]
sheet.getRange("A4:M4").values = headers; sheet.getRange(`A5:M${groups.length + 4}`).values = groups
sheet.getRange("A1:M1").format = { font: { name: "Arial", size: 14, bold: true, color: "#1F2937" } }
sheet.getRange("A2:M2").format = { font: { name: "Arial", size: 10, italic: true, color: "#4B5563" } }
sheet.getRange("A4:M4").format = { fill: "#1F4E78", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center" }
sheet.getRange(`A5:M${groups.length + 4}`).format = { font: { name: "Arial", size: 10 }, verticalAlignment: "center", wrapText: false }
sheet.getRange(`A4:M${groups.length + 4}`).format.borders = { preset: "outside", style: "thin", color: "#D1D5DB" }
sheet.getRange(`M5:M${groups.length + 4}`).format.fill = "#FEF3C7"
sheet.getRange(`E5:F${groups.length + 4}`).format.horizontalAlignment = "center"
sheet.getRange(`G5:H${groups.length + 4}`).format.wrapText = true; sheet.getRange(`L5:L${groups.length + 4}`).format.wrapText = true
for (const [col, width] of [["A:A", 28], ["B:B", 28], ["C:D", 24], ["E:F", 12], ["G:G", 48], ["H:H", 34], ["I:J", 24], ["K:K", 14], ["L:L", 34], ["M:M", 20]]) sheet.getRange(col).format.columnWidth = width
sheet.getRange(`A4:M${groups.length + 4}`).format.rowHeight = 18; sheet.getRange(`G5:H${groups.length + 4}`).format.rowHeight = 34
sheet.freezePanes.freezeRows(4); sheet.freezePanes.freezeColumns(2)
sheet.tables.add(`A4:M${groups.length + 4}`, true, "BomReconciliation")
wb.recalculate()
await fs.promises.mkdir(path.dirname(output), { recursive: true })
const xlsx = await SpreadsheetFile.exportXlsx(wb); await xlsx.save(output)
const check = await wb.inspect({ kind: "table", range: `Unique components!A1:M12`, include: "values", tableMaxRows: 12, tableMaxCols: 13 })
console.log(check.ndjson)
const preview = await wb.render({ sheetName: "Unique components", range: "A1:M20", scale: 1.2, format: "png" })
await fs.promises.writeFile("docs/bom-unique-components-reconciliation-preview.png", new Uint8Array(await preview.arrayBuffer()))
console.log(JSON.stringify({ candidates: candidates.length, unique: groups.length, output }))
