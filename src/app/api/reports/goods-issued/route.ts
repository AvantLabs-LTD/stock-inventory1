import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/reports/goods-issued?departmentId=xxx&projectId=xxx&dateFrom=xxx&dateTo=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reports', 'view')) {
      return forbiddenResponse('No permission to view reports')
    }

    const { searchParams } = new URL(request.url)
    const departmentId = searchParams.get('departmentId')
    const projectId = searchParams.get('projectId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const filter: Record<string, unknown> = {}
    if (departmentId) filter.departmentId = departmentId
    if (projectId) filter.projectId = projectId
    if (dateFrom || dateTo) {
      filter.date = {}
      if (dateFrom) (filter.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (filter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    const records = await db.inventoryIssue.findMany({
      where: Object.keys(filter).length > 0 ? filter : undefined,
      orderBy: { date: 'desc' },
      include: {
        product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
        department: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        issuedByUser: { select: { id: true, name: true } },
      },
    })

    const data = records.map((r) => ({
      id: r.id,
      date: r.date,
      productId: r.productId,
      product: r.product,
      departmentId: r.departmentId,
      department: r.department,
      projectId: r.projectId,
      project: r.project,
      issuedBy: r.issuedBy,
      issuedByUser: r.issuedByUser,
      employeeName: r.employeeName,
      quantity: r.quantity,
      remarks: r.remarks,
    }))

    const totalIssued = data.reduce((s, d) => s + d.quantity, 0)
    const uniqueProducts = new Set(data.map((d) => d.productId)).size
    const uniqueDepartments = new Set(data.map((d) => d.departmentId)).size

    return Response.json({
      data,
      summary: {
        totalRecords: data.length,
        totalIssued,
        uniqueProducts,
        uniqueDepartments,
      },
    })
  } catch (error) {
    console.error('GET /api/reports/goods-issued error:', error)
    return Response.json({ error: 'Failed to generate goods issued report' }, { status: 500 })
  }
}
