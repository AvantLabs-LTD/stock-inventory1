import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/requests/[id] — Get single request detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'inventory_requests', 'view')) {
      return forbiddenResponse('No permission to view inventory requests')
    }

    const { id } = await params

    const req = await db.inventoryRequest.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
        department: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true, status: true } },
        requestedByUser: { select: { id: true, name: true, email: true, role: true } },
      },
    })

    if (!req) {
      return Response.json({ error: 'Request not found' }, { status: 404 })
    }

    return Response.json({ data: req })
  } catch (error) {
    console.error('GET /api/requests/[id] error:', error)
    return Response.json({ error: 'Failed to fetch request detail' }, { status: 500 })
  }
}
