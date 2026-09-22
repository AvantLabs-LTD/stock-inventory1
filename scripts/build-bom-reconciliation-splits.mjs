import fs from "node:fs/promises"
import XLSX from "xlsx"
import { Workbook, SpreadsheetFile } from "file:///C:/Users/max12/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs"

const source = XLSX.readFile("docs/bom-unique-components-reconciliation.xlsx")
const sheet = source.Sheets["Unique components"]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false })
const headers = rows[3]
const data = rows.slice(4).filter(row => row[0])
const matches = JSON.parse(await fs.readFile("docs/bom-live-match-results.json", "utf8")).matches
const norm = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const identity = row => row[2] ? `MPN:${norm(row[2])}` : row[3] ? `SUP:${norm(row[3])}` : `TXT:${norm(row[0])}|${norm(row[1])}`

async function output(name, title, subtitle, selected) {
  const wb = Workbook.create(); const ws = wb.worksheets.add("Components")
  ws.showGridLines = false
  ws.getRange("A1:M1").merge(); ws.getRange("A1").values = [[title]]
  ws.getRange("A2:M2").merge(); ws.getRange("A2").values = [[subtitle]]
  ws.getRange("A4:M4").values = [headers]; ws.getRange(`A5:M${selected.length + 4}`).values = selected
  ws.getRange("A1:M1").format = { font: { name: "Arial", size: 14, bold: true, color: "#1F2937" } }
  ws.getRange("A2:M2").format = { font: { name: "Arial", size: 10, italic: true, color: "#4B5563" } }
  ws.getRange("A4:M4").format = { fill: "#1F4E78", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center" }
  ws.getRange(`A5:M${selected.length + 4}`).format = { font: { name: "Arial", size: 10 }, verticalAlignment: "center" }
  ws.getRange(`A4:M${selected.length + 4}`).format.borders = { preset: "outside", style: "thin", color: "#D1D5DB" }
  ws.getRange(`M5:M${selected.length + 4}`).format.fill = "#FEF3C7"
  ws.getRange(`G5:H${selected.length + 4}`).format.wrapText = true; ws.getRange(`L5:L${selected.length + 4}`).format.wrapText = true
  for (const [column, width] of [["A:A", 28], ["B:B", 28], ["C:D", 24], ["E:F", 12], ["G:G", 48], ["H:H", 34], ["I:J", 24], ["K:K", 14], ["L:L", 34], ["M:M", 20]]) ws.getRange(column).format.columnWidth = width
  ws.freezePanes.freezeRows(4); ws.freezePanes.freezeColumns(2); ws.tables.add(`A4:M${selected.length + 4}`, true, "ComponentsTable")
  wb.recalculate(); const result = await SpreadsheetFile.exportXlsx(wb); await result.save(`docs/${name}`)
  const check = await wb.inspect({ kind: "table", range: "Components!A1:M7", include: "values", tableMaxRows: 7, tableMaxCols: 13 }); console.log(check.ndjson)
}

const exactMpn = data.filter(row => matches[identity(row)]?.strength === "STRONG" && ["MPN", "BOTH"].includes(matches[identity(row)]?.basis))
const remaining = data.filter(row => !exactMpn.includes(row))
await output("bom-exact-mpn-recommendations.xlsx", "Exact-MPN BOM recommendations", "Exact MPN matches to one live store Item. These are recommendations for later controlled processing, not applied mappings.", exactMpn)
await output("bom-reconciliation-audit-remaining.xlsx", "Remaining BOM reconciliation audit", "Everything not confirmed by an exact MPN match, including supplier-only, text, weak, ambiguous, and unmatched candidates.", remaining)
console.log(JSON.stringify({ exactMpn: exactMpn.length, remaining: remaining.length }))
