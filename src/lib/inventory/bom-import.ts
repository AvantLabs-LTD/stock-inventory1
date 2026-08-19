import ExcelJS from 'exceljs'
import { Prisma } from '@prisma/client'

export const BOM_COLUMNS = [
  'Line ID',
  'Parent Line ID',
  'Title',
  'Category',
  'Description',
  'Function',
  'Link',
  'Option Selection',
  'Remarks',
  'Quantity',
] as const

export interface BomImportRow {
  lineId: string
  parentLineId: string | null
  title: string
  discipline: 'MECHANICAL' | 'ELECTRONICS'
  description: string
  function: string | null
  link: string | null
  optionSelection: string | null
  remarks: string | null
  quantity: Prisma.Decimal
  sortOrder: number
}

export class BomImportError extends Error {
  constructor(message: string, public readonly row?: number) {
    super(row ? `Row ${row}: ${message}` : message)
    this.name = 'BomImportError'
  }
}

function text(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim()
  if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim()
  return String(value).trim()
}

function discipline(value: string, row: number): 'MECHANICAL' | 'ELECTRONICS' {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'MECHANICAL') return 'MECHANICAL'
  if (normalized === 'ELECTRONICS' || normalized === 'ELECTRONIC') return 'ELECTRONICS'
  throw new BomImportError('Category must be Mechanical or Electronics', row)
}

export function validateBomHierarchy(rows: BomImportRow[]) {
  if (rows.length === 0) throw new BomImportError('The BOM has no data rows')

  const byId = new Map<string, BomImportRow>()
  for (const row of rows) {
    if (byId.has(row.lineId)) throw new BomImportError(`Duplicate Line ID "${row.lineId}"`)
    byId.set(row.lineId, row)
  }

  for (const row of rows) {
    if (!row.parentLineId) continue
    if (row.parentLineId === row.lineId) {
      throw new BomImportError(`Line "${row.lineId}" cannot be its own parent`)
    }
    if (!byId.has(row.parentLineId)) {
      throw new BomImportError(`Parent Line ID "${row.parentLineId}" does not exist`)
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  function visit(lineId: string) {
    if (visiting.has(lineId)) throw new BomImportError(`Dependency cycle detected at Line ID "${lineId}"`)
    if (visited.has(lineId)) return
    visiting.add(lineId)
    const parentId = byId.get(lineId)?.parentLineId
    if (parentId) visit(parentId)
    visiting.delete(lineId)
    visited.add(lineId)
  }
  for (const row of rows) visit(row.lineId)
}

export async function parseBomWorkbook(file: File) {
  const workbook = new ExcelJS.Workbook()
  const bytes = Buffer.from(await file.arrayBuffer())
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new BomImportError('The workbook has no worksheet')

  const actualHeaders = BOM_COLUMNS.map((_, index) => text(sheet.getRow(1).getCell(index + 1).value))
  const wrongHeader = BOM_COLUMNS.findIndex(
    (expected, index) => actualHeaders[index].toLowerCase() !== expected.toLowerCase()
  )
  if (wrongHeader !== -1) {
    throw new BomImportError(
      `Column ${wrongHeader + 1} must be "${BOM_COLUMNS[wrongHeader]}"; found "${actualHeaders[wrongHeader] || '(empty)'}"`
    )
  }

  const rows: BomImportRow[] = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const excelRow = sheet.getRow(rowNumber)
    const values = BOM_COLUMNS.map((_, index) => text(excelRow.getCell(index + 1).value))
    if (values.every((value) => value === '')) continue

    const [lineId, parentLineId, title, category, description, fn, link, option, remarks, rawQuantity] = values
    if (!lineId) throw new BomImportError('Line ID is required', rowNumber)
    if (!title) throw new BomImportError('Title is required', rowNumber)
    if (!description) throw new BomImportError('Description is required', rowNumber)

    let quantity: Prisma.Decimal
    try {
      quantity = new Prisma.Decimal(rawQuantity)
    } catch {
      throw new BomImportError('Quantity must be a number', rowNumber)
    }
    if (!quantity.isPositive()) throw new BomImportError('Quantity must be greater than zero', rowNumber)

    rows.push({
      lineId,
      parentLineId: parentLineId || null,
      title,
      discipline: discipline(category, rowNumber),
      description,
      function: fn || null,
      link: link || null,
      optionSelection: option || null,
      remarks: remarks || null,
      quantity,
      sortOrder: rows.length,
    })
  }

  if (rows.length > 5000) throw new BomImportError('A BOM may contain at most 5,000 data rows')
  validateBomHierarchy(rows)
  return { sheetName: sheet.name, rows }
}
