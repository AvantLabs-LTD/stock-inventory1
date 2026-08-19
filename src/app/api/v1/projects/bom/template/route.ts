import ExcelJS from 'exceljs'
import { NextRequest } from 'next/server'
import { BOM_COLUMNS } from '@/lib/inventory/bom-import'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'project_bom', 'view')) return forbiddenResponse()

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Project BOM')
  sheet.addRow([...BOM_COLUMNS])
  sheet.addRow(['A', '', 'Manufactured Item A', 'Mechanical', 'Top-level project item', '', '', '', '', 10])
  sheet.addRow(['B', 'A', 'Standard Component B', 'Electronics', 'Two required per A', '', '', '', '', 2])
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.columns.forEach((column) => { column.width = 24 })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Response(buffer as BodyInit, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="project-bom-template.xlsx"',
    },
  })
}
