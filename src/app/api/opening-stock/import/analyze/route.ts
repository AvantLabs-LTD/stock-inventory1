import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

export const maxDuration = 60

// ─── POST /api/opening-stock/import/analyze — Analyze uploaded file ────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can import')
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      return Response.json({ error: 'Only .xlsx, .xls, and .csv files are supported' }, { status: 400 })
    }

    if (file.size === 0) {
      return Response.json({ error: 'File is empty' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return Response.json({ error: 'File too large (max 50 MB)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = new ExcelJS.Workbook()
    let sheet: ExcelJS.Worksheet | undefined

    if (fileName.endsWith('.csv')) {
      const text = buffer.toString('utf-8')
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length < 2) {
        return Response.json({ error: 'CSV file has no data rows' }, { status: 400 })
      }
      sheet = workbook.addWorksheet('Import')
      sheet.addRow(parseCSVLine(lines[0]))
      for (let i = 1; i < lines.length; i++) {
        sheet.addRow(parseCSVLine(lines[i]))
      }
    } else {
      await workbook.xlsx.load(buffer)
      sheet = workbook.worksheets[0]
    }

    if (!sheet || sheet.rowCount < 2) {
      return Response.json({ error: 'File has no data rows' }, { status: 400 })
    }

    // Available sheets
    const sheetNames = workbook.worksheets.map((s) => ({
      name: s.name,
      rowCount: s.rowCount,
    }))

    // Auto-detect header row (look for first row with recognizable headers)
    let headerRowIndex = 1
    const headerRow = sheet.getRow(headerRowIndex)

    // Build column mapping
    const headerMap = new Map<string, number>()
    const extraColumns = new Map<string, number>()

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = getCellStringValue(cell)
      const lower = header.toLowerCase()

      // Standard column recognition
      if (lower.includes('name') || lower.includes('item') || lower.includes('product')) {
        if (!headerMap.has('name')) headerMap.set('name', colNumber)
      } else if (lower.includes('spec') || lower.includes('part') || lower.includes('model') && !lower.includes('number')) {
        headerMap.set('specification', colNumber)
      } else if (lower.includes('categ')) {
        headerMap.set('category', colNumber)
      } else if (lower.includes('unit') || lower.includes('uom') || lower.includes('a/u')) {
        headerMap.set('unit', colNumber)
      } else if (lower.includes('qty') || lower.includes('quantity') || lower.includes('opening') || (lower.includes('stock') && !lower.includes('status'))) {
        headerMap.set('quantity', colNumber)
      } else if (lower.includes('batch') || lower.includes('lot')) {
        headerMap.set('batchNumber', colNumber)
      } else if (lower.includes('serial') || lower.includes('s/n')) {
        headerMap.set('serialNumber', colNumber)
      } else if (lower.includes('remark') || lower.includes('note') || lower.includes('comment')) {
        headerMap.set('remarks', colNumber)
      } else if (lower.includes('warehouse') || lower.includes('wh ')) {
        headerMap.set('warehouse', colNumber)
      } else if (lower.includes('supplier') || lower.includes('vendor')) {
        headerMap.set('supplier', colNumber)
      } else if (lower.includes('cost') || lower.includes('price') || lower.includes('rate')) {
        headerMap.set('unitCost', colNumber)
      } else if (lower.includes('expiry') || lower.includes('expire') || lower.includes('valid') || lower.includes('shelf')) {
        headerMap.set('expiryDate', colNumber)
      } else if (lower.includes('location') || lower.includes('shelf') || lower.includes('bin') || lower.includes('storage')) {
        headerMap.set('storageLocation', colNumber)
      } else if (lower.includes('invoice') || lower.includes('po') || lower.includes('purchase')) {
        headerMap.set('invoiceNumber', colNumber)
      } else if (lower === 'sr' || lower === 'sr/no' || lower === 'sno' || lower === '#' || lower === 'no') {
        headerMap.set('serialNo', colNumber)
      } else if (header.length > 0) {
        // Anything else → extra column (likely project field)
        extraColumns.set(header, colNumber)
      }
    })

    // Validate required columns
    if (!headerMap.has('name')) {
      return Response.json({
        error: 'Missing required column: Item Name (or column containing "name" or "item")',
        detectedHeaders: Array.from(headerMap.keys()),
        extraColumns: Array.from(extraColumns.keys()),
      }, { status: 400 })
    }

    // Preview first few rows
    const previewRows: Record<string, string | number | null>[] = []
    const maxPreview = Math.min(5, sheet.rowCount - 1)

    for (let i = 2; i <= maxPreview + 1; i++) {
      const row = sheet.getRow(i)
      const rowData: Record<string, string | number | null> = {}

      for (const [field, colNum] of headerMap) {
        const cell = row.getCell(colNum)
        rowData[field] = getCellRawValue(cell)
      }

      for (const [colName, colNum] of extraColumns) {
        const extraCell = row.getCell(colNum)
        rowData[colName] = getCellRawValue(extraCell)
      }

      previewRows.push(rowData)
    }

    // Count valid rows (rows with at least a name)
    let validRows = 0
    let invalidRows = 0
    let duplicateRows = 0
    const seenNames = new Map<string, number>()

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i)
      const name = headerMap.has('name')
        ? getCellStringValue(row.getCell(headerMap.get('name')!))
        : ''

      if (!name) continue

      validRows++

      // Check duplicates
      if (seenNames.has(name)) {
        duplicateRows++
      } else {
        seenNames.set(name, i)
      }
    }

    // Detect project fields from extra columns
    // Filter out obvious non-project columns
    const projectFieldCandidates = Array.from(extraColumns.keys()).filter((name) => {
      const lower = name.toLowerCase()
      return !['sr', 'sr/no', 'sno', '#', 'no', 'total', 'subtotal', 'grand total'].includes(lower)
    })

    return Response.json({
      fileName: file.name,
      fileSize: file.size,
      sheetNames,
      totalRows: sheet.rowCount - 1,
      validRows,
      invalidRows: (sheet.rowCount - 1) - validRows,
      duplicateRows,
      columnMapping: {
        standard: Object.fromEntries(headerMap),
        extra: Object.fromEntries(extraColumns),
      },
      projectFieldCandidates,
      previewRows,
      warnings: [
        ...(duplicateRows > 0 ? [`${duplicateRows} duplicate item name(s) detected`] : []),
        ...(extraColumns.size > 0 ? [`Extra columns detected (likely project fields): ${projectFieldCandidates.join(', ')}`] : []),
      ],
    })
  } catch (error) {
    console.error('POST /api/opening-stock/import/analyze error:', error)
    return Response.json({ error: 'Failed to analyze file' }, { status: 500 })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCellStringValue(cell: ExcelJS.Cell): string {
  const val = cell.value
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return String(val)
  if (val instanceof Date) return val.toISOString().split('T')[0]
  if (typeof val === 'object' && 'richText' in val && Array.isArray(val.richText)) {
    return (val.richText as Array<{ text: string }>).map((r) => r.text).join('').trim()
  }
  if (typeof val === 'object' && 'formula' in val) {
    const formulaVal = (val as { result?: unknown }).result
    return formulaVal !== null && formulaVal !== undefined ? String(formulaVal).trim() : ''
  }
  if (typeof val === 'object' && 'text' in val) {
    return String((val as { text: string }).text).trim()
  }
  return String(val).trim()
}

function getCellRawValue(cell: ExcelJS.Cell): string | number | null {
  const val = cell.value
  if (val === null || val === undefined) return null
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number') return val
  if (typeof val === 'boolean') return String(val)
  if (val instanceof Date) return val.toISOString().split('T')[0]
  if (typeof val === 'object' && 'richText' in val && Array.isArray(val.richText)) {
    return (val.richText as Array<{ text: string }>).map((r) => r.text).join('').trim()
  }
  if (typeof val === 'object' && 'formula' in val) {
    const formulaVal = (val as { result?: unknown }).result
    if (formulaVal !== null && formulaVal !== undefined) {
      return typeof formulaVal === 'number' ? formulaVal : String(formulaVal).trim()
    }
    return null
  }
  return String(val).trim()
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}
