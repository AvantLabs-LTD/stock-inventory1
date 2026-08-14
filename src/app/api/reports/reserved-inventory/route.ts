import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/reports/reserved-inventory
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'reports', 'view')) {
      return forbiddenResponse('No permission to view reports')
    }

    const records = await db.reservedInventory.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
        project: { select: { id: true, name: true, code: true, status: true, department: { select: { name: true } } } },
        reservedByUser: { select: { id: true, name: true } },
      },
    })

    const data = records.map((r) => ({
      id: r.id,
      product: r.product,
      project: r.project,
      quantity: r.quantity,
      reason: r.reason,
      remarks: r.remarks,
      reservedBy: r.reservedBy,
      reservedByUser: r.reservedByUser,
      createdAt: r.createdAt,
    }))

    const totalReserved = data.reduce((s, d) => s + d.quantity, 0)
    const uniqueProducts = new Set(data.map((d) => d.product.id)).size
    const uniqueProjects = new Set(data.map((d) => d.project.id)).size

    return Response.json({
      data,
      summary: {
        totalRecords: data.length,
        totalReserved,
        uniqueProducts,
        uniqueProjects,
      },
    })
  } catch (error) {
    console.error('GET /api/reports/reserved-inventory error:', error)
    return Response.json({ error: 'Failed to generate reserved inventory report' }, { status: 500 })
  }
}
