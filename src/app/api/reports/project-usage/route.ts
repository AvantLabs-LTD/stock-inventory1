import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/reports/project-usage?departmentId=xxx&dateFrom=xxx&dateTo=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reports', 'view')) {
      return forbiddenResponse('No permission to view reports')
    }

    const { searchParams } = new URL(request.url)
    const departmentId = searchParams.get('departmentId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const issueFilter: Record<string, unknown> = {}
    if (departmentId) issueFilter.departmentId = departmentId
    if (dateFrom || dateTo) {
      issueFilter.date = {}
      if (dateFrom) (issueFilter.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (issueFilter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    const returnFilter: Record<string, unknown> = {}
    if (departmentId) returnFilter.departmentId = departmentId
    if (dateFrom || dateTo) {
      returnFilter.date = {}
      if (dateFrom) (returnFilter.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (returnFilter.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    const reservationFilter: Record<string, unknown> = { status: 'ACTIVE' }
    if (departmentId) {
      const projectIds = await db.project.findMany({
        where: { departmentId },
        select: { id: true },
      })
      reservationFilter.projectId = { in: projectIds.map((p) => p.id) }
    }

    // Get projects with department info
    const projects = await db.project.findMany({
      where: departmentId ? { departmentId } : undefined,
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    })

    const projectIds = projects.map((p) => p.id)

    // Aggregate issued by project
    const issueFilterWithProject = { ...issueFilter }
    if (projectIds.length > 0) issueFilterWithProject.projectId = { in: projectIds }

    const issuedAgg = await db.inventoryIssue.groupBy({
      by: ['projectId'],
      where: Object.keys(issueFilterWithProject).length > 0 ? issueFilterWithProject : undefined,
      _sum: { quantity: true },
      _count: { id: true },
    })

    const returnAgg = await db.inventoryReturn.groupBy({
      by: ['projectId'],
      where: projectIds.length > 0
        ? { projectId: { in: projectIds }, ...Object.keys(returnFilter).length > 0 ? returnFilter : {} }
        : Object.keys(returnFilter).length > 0 ? returnFilter : undefined,
      _sum: { quantity: true },
      _count: { id: true },
    })

    const reservationAgg = await db.reservedInventory.groupBy({
      by: ['projectId'],
      where: projectIds.length > 0
        ? { projectId: { in: projectIds }, status: 'ACTIVE' }
        : { status: 'ACTIVE' },
      _sum: { quantity: true },
      _count: { id: true },
    })

    const issuedMap = new Map(issuedAgg.map((a) => [a.projectId, { total: a._sum.quantity || 0, count: a._count.id }]))
    const returnMap = new Map(returnAgg.map((a) => [a.projectId, { total: a._sum.quantity || 0, count: a._count.id }]))
    const reservedMap = new Map(reservationAgg.map((a) => [a.projectId, { total: a._sum.quantity || 0, count: a._count.id }]))

    const data = projects.map((proj) => {
      const issued = issuedMap.get(proj.id) || { total: 0, count: 0 }
      const returned = returnMap.get(proj.id) || { total: 0, count: 0 }
      const reserved = reservedMap.get(proj.id) || { total: 0, count: 0 }
      return {
        projectId: proj.id,
        projectName: proj.name,
        projectCode: proj.code,
        projectStatus: proj.status,
        departmentName: proj.department?.name ?? null,
        totalIssued: issued.total,
        issueCount: issued.count,
        totalReturned: returned.total,
        returnCount: returned.count,
        totalReserved: reserved.total,
        reservationCount: reserved.count,
        netUsage: issued.total - returned.total,
      }
    }).filter((d) => d.totalIssued > 0 || d.totalReturned > 0 || d.totalReserved > 0)

    const summary = {
      totalProjects: data.length,
      totalIssued: data.reduce((s, d) => s + d.totalIssued, 0),
      totalReturned: data.reduce((s, d) => s + d.totalReturned, 0),
      totalReserved: data.reduce((s, d) => s + d.totalReserved, 0),
      netUsage: data.reduce((s, d) => s + d.netUsage, 0),
    }

    return Response.json({ data, summary })
  } catch (error) {
    console.error('GET /api/reports/project-usage error:', error)
    return Response.json({ error: 'Failed to generate project usage report' }, { status: 500 })
  }
}
