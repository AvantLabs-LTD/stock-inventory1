import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── GET /api/opening-stock/template — Download simplified import template ───
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to download template')
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'InventoryPro'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Opening Stock Template')

    // Columns
    const columns = [
      { header: 'Item Name', key: 'name', width: 30 },
      { header: 'Specification', key: 'specification', width: 25 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Opening Quantity', key: 'quantity', width: 18 },
      { header: 'Batch Number', key: 'batchNumber', width: 18 },
      { header: 'Serial Number', key: 'serialNumber', width: 18 },
      { header: 'Remarks', key: 'remarks', width: 30 },
    ]
    sheet.columns = columns

    // Style header row
    const headerRow = sheet.getRow(1)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF374151' },
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' },
      }
    })
    headerRow.height = 28

    // Add example row
    const exampleRow = sheet.addRow({
      name: 'M8 Hex Bolt',
      specification: 'Grade 8.8, Zinc Plated',
      category: 'Fasteners',
      unit: 'pcs',
      quantity: 500,
      batchNumber: 'BATCH-001',
      serialNumber: '',
      remarks: 'Opening balance for warehouse A',
    })

    exampleRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      }
      cell.font = { italic: true, color: { argb: 'FF6B7280' } }
    })

    // Freeze header
    sheet.views = [{ state: 'frozen', ySplit: 1 }]

    // Add instruction sheet
    const instructions = workbook.addWorksheet('Instructions')
    instructions.columns = [{ header: 'Column', width: 20 }, { header: 'Description', width: 60 }, { header: 'Required', width: 12 }]

    const instrHeader = instructions.getRow(1)
    instrHeader.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    const instructionsData = [
      { column: 'Item Name', description: 'Name of the item/product', required: 'Yes' },
      { column: 'Specification', description: 'Specification, model number, or part description', required: 'No' },
      { column: 'Category', description: 'Product category name (auto-created if not exists)', required: 'No' },
      { column: 'Unit', description: 'Unit of measurement (pcs, kg, m, etc.)', required: 'No (default: pcs)' },
      { column: 'Opening Quantity', description: 'Opening stock quantity (must be > 0)', required: 'Yes' },
      { column: 'Batch Number', description: 'Batch or lot number', required: 'No' },
      { column: 'Serial Number', description: 'Serial number for tracking', required: 'No' },
      { column: 'Remarks', description: 'Any additional notes', required: 'No' },
    ]

    for (const instr of instructionsData) {
      instructions.addRow(instr)
    }

    // Add blank row
    instructions.addRow({})

    // Add tips
    instructions.addRow({ column: 'Tip', description: 'Project field columns (like BL-CHS, KZ-CHS) are auto-detected during import', required: '' })
    instructions.addRow({ column: 'Tip', description: 'Products are auto-created if they do not exist in the system', required: '' })
    instructions.addRow({ column: 'Tip', description: 'Categories and suppliers are auto-created from their names', required: '' })
    instructions.addRow({ column: 'Tip', description: 'Remove the example row before importing your data', required: '' })

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()
    const filename = 'Opening Stock Template.xlsx'

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    })
  } catch (error) {
    console.error('GET /api/opening-stock/template error:', error)
    return Response.json({ error: 'Failed to generate template' }, { status: 500 })
  }
}
