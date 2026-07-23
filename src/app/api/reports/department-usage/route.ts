import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/reports/department-usage?dateFrom=xxx&dateTo=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reports', 'view')) {
      return forbiddenResponse('No permission to view reports')
    }

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const issueFilter: Record<string, unknown> = {}
    if (dateFrom || dateTo) {
      issueFilter.date = {}
      if (dateFrom) (issueFilter.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (issueFilter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    const returnFilter: Record<string, unknown> = {}
    if (dateFrom || dateTo) {
      returnFilter.date = {}
      if (dateFrom) (returnFilter.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (returnFilter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    // Get all departments
    const departments = await db.department.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    })

    // Aggregate issued by department
    const issuedAgg = await db.inventoryIssue.groupBy({
      by: ['departmentId'],
      where: Object.keys(issueFilter).length > 0 ? issueFilter : undefined,
      _sum: { quantity: true },
      _count: { id: true },
    })

    const returnAgg = await db.inventoryReturn.groupBy({
      by: ['departmentId'],
      where: Object.keys(returnFilter).length > 0 ? returnFilter : undefined,
      _sum: { quantity: true },
      _count: { id: true },
    })

    const issuedMap = new Map(issuedAgg.map((a) => [a.departmentId, { total: a._sum.quantity || 0, count: a._count.id }]))
    const returnMap = new Map(returnAgg.map((a) => [a.departmentId, { total: a._sum.quantity || 0, count: a._count.id }]))

    const data = departments.map((dept) => {
      const issued = issuedMap.get(dept.id) || { total: 0, count: 0 }
      const returned = returnMap.get(dept.id) || { total: 0, count: 0 }
      return {
        departmentId: dept.id,
        departmentName: dept.name,
        departmentCode: dept.code,
        totalIssued: issued.total,
        issueCount: issued.count,
        totalReturned: returned.total,
        returnCount: returned.count,
        netUsage: issued.total - returned.total,
      }
    }).filter((d) => d.totalIssued > 0 || d.totalReturned > 0)

    const summary = {
      totalDepartments: data.length,
      totalIssued: data.reduce((s, d) => s + d.totalIssued, 0),
      totalReturned: data.reduce((s, d) => s + d.totalReturned, 0),
      netUsage: data.reduce((s, d) => s + d.netUsage, 0),
    }

    return Response.json({ data, summary })
  } catch (error) {
    console.error('GET /api/reports/department-usage error:', error)
    return Response.json({ error: 'Failed to generate department usage report' }, { status: 500 })
  }
}
