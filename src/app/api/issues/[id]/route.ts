import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/issues/[id] — Single issue with all relations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'issue_inventory', 'view')) {
      return forbiddenResponse('No permission to view inventory issues')
    }

    const { id } = await params

    const issue = await db.inventoryIssue.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
        department: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true, status: true } },
        issuedByUser: { select: { id: true, name: true, email: true } },
      },
    })

    if (!issue) {
      return Response.json({ error: 'Inventory issue not found' }, { status: 404 })
    }

    return Response.json({ data: issue })
  } catch (error) {
    console.error('GET /api/issues/[id] error:', error)
    return Response.json({ error: 'Failed to fetch inventory issue' }, { status: 500 })
  }
}
