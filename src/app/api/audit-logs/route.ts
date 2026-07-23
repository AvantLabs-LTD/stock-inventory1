import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/audit-logs — List audit logs with search, filters, pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (
      !hasPermission(session.user.role, 'audit_logs' as never, 'view' as never)
    ) {
      return forbiddenResponse('No permission to view audit logs')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const search = searchParams.get('search') || ''
    const action = searchParams.get('action') || ''
    const userId = searchParams.get('userId') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { userName: { contains: search } },
        { details: { contains: search } },
        { entityType: { contains: search } },
        { ipAddress: { contains: search } },
      ]
    }

    if (action) {
      where.action = action
    }

    if (userId) {
      where.userId = userId
    }

    if (dateFrom || dateTo) {
      where.date = {} as Record<string, unknown>
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z')
    }

    const [items, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          userId: true,
          userName: true,
          action: true,
          entityType: true,
          entityId: true,
          details: true,
          ipAddress: true,
          date: true,
        },
      }),
      db.auditLog.count({ where }),
    ])

    return Response.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('GET /api/audit-logs error:', error)
    return Response.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}
