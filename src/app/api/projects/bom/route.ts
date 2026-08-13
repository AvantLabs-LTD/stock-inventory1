import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// POST /api/projects/bom — Upload and parse BOM Excel file
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'projects', 'edit')) {
      return forbiddenResponse('No permission to upload BOM')
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const projectId = formData.get('projectId') as string | null

    if (!file) {
      return Response.json({ error: 'No file uploaded' }, { status: 400 })
    }
    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 })
    }

    // Verify project exists
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    })
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    // Parse Excel file
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const sheet = workbook.worksheets[0]
    if (!sheet) {
      return Response.json({ error: 'No worksheet found in the file' }, { status: 400 })
    }

    // Extract column headers from first row
    const headers: string[] = []
    const headerRow = sheet.getRow(1)
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const val = String(cell.value || `Column ${colNumber}`).trim()
      if (val) headers.push(val)
    })

    if (headers.length === 0) {
      return Response.json({ error: 'No columns found in the file' }, { status: 400 })
    }

    // Extract data rows
    const rows: Record<string, unknown>[] = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // Skip header
      const rowData: Record<string, unknown> = {}
      headers.forEach((header, idx) => {
        const cell = row.getCell(idx + 1)
        const val = cell.value
        if (val === null || val === undefined) {
          rowData[header] = ''
        } else if (typeof val === 'object' && val !== null && 'result' in val) {
          rowData[header] = String((val as { result: unknown }).result ?? '')
        } else {
          rowData[header] = val
        }
      })
      // Only add rows that have at least one non-empty value
      const hasData = Object.values(rowData).some((v) => v !== '' && v !== null && v !== undefined)
      if (hasData) rows.push(rowData)
    })

    // Delete existing BOM items for this project
    await db.projectBomItem.deleteMany({ where: { projectId } })

    // Store BOM items
    const bomData = rows.map((row, idx) => ({
      projectId,
      fileName: file.name,
      sheetName: sheet.name,
      rowData: JSON.stringify(row),
      sortOrder: idx,
    }))

    if (bomData.length > 0) {
      await db.projectBomItem.createMany({ data: bomData })
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'CREATED',
        entityType: 'ProjectBom',
        entityId: projectId,
        details: `Uploaded BOM for project ${project.name}: ${file.name} with ${rows.length} rows, ${headers.length} columns`,
      },
    })

    return Response.json({
      data: {
        projectId,
        fileName: file.name,
        sheetName: sheet.name,
        columns: headers,
        rowCount: rows.length,
        rows,
      },
    })
  } catch (error) {
    console.error('POST /api/projects/bom error:', error)
    return Response.json({ error: 'Failed to upload BOM file' }, { status: 500 })
  }
}

// GET /api/projects/bom?projectId=xxx — Get BOM data for a project
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'projects', 'view')) {
      return forbiddenResponse('No permission to view BOM')
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 })
    }

    const bomItems = await db.projectBomItem.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    })

    if (bomItems.length === 0) {
      return Response.json({ data: null })
    }

    // Parse all rows and extract columns from the first one
    const parsedRows = bomItems.map((item) => JSON.parse(item.rowData) as Record<string, unknown>)
    const columns = Object.keys(parsedRows[0] || {})

    return Response.json({
      data: {
        projectId,
        fileName: bomItems[0].fileName,
        sheetName: bomItems[0].sheetName,
        columns,
        rowCount: parsedRows.length,
        rows: parsedRows,
      },
    })
  } catch (error) {
    console.error('GET /api/projects/bom error:', error)
    return Response.json({ error: 'Failed to fetch BOM data' }, { status: 500 })
  }
}

// DELETE /api/projects/bom?projectId=xxx — Delete BOM data for a project
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'projects', 'edit')) {
      return forbiddenResponse('No permission to delete BOM')
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 })
    }

    const result = await db.projectBomItem.deleteMany({ where: { projectId } })

    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'DELETED',
        entityType: 'ProjectBom',
        entityId: projectId,
        details: `Deleted BOM for project (removed ${result.count} items)`,
      },
    })

    return Response.json({ message: `BOM deleted (${result.count} items removed)` })
  } catch (error) {
    console.error('DELETE /api/projects/bom error:', error)
    return Response.json({ error: 'Failed to delete BOM' }, { status: 500 })
  }
}
