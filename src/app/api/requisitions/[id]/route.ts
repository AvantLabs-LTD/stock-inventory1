import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/requisitions/[id] — Get single material requisition detail
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

    const requisition = await db.materialRequisition.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        requestedByUser: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
          },
        },
      },
    })

    if (!requisition) {
      return Response.json({ error: 'Requisition not found' }, { status: 404 })
    }

    return Response.json({ data: requisition })
  } catch (error) {
    console.error('GET /api/requisitions/[id] error:', error)
    return Response.json({ error: 'Failed to fetch requisition detail' }, { status: 500 })
  }
}

// PUT /api/requisitions/[id] — Update material requisition
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'inventory_requests', 'edit')) {
      return forbiddenResponse('No permission to edit inventory requests')
    }

    const { id } = await params
    const body = await request.json()
    const { issuedByName, receivedByName, remarks } = body

    // Find the requisition
    const requisition = await db.materialRequisition.findUnique({
      where: { id },
    })

    if (!requisition) {
      return Response.json({ error: 'Requisition not found' }, { status: 404 })
    }

    if (requisition.status !== 'APPROVED' && requisition.status !== 'PARTIAL_APPROVED') {
      return Response.json(
        { error: `Cannot update a requisition with status ${requisition.status}. Must be APPROVED or PARTIAL_APPROVED.` },
        { status: 400 }
      )
    }

    // Build update data
    const data: Record<string, unknown> = {}
    if (issuedByName !== undefined) data.issuedByName = issuedByName || null
    if (receivedByName !== undefined) data.receivedByName = receivedByName || null
    if (remarks !== undefined) data.remarks = remarks || null

    // Update the requisition
    const updated = await db.materialRequisition.update({
      where: { id },
      data,
      include: {
        department: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        requestedByUser: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
          },
        },
      },
    })

    return Response.json({ data: updated })
  } catch (error) {
    console.error('PUT /api/requisitions/[id] error:', error)
    return Response.json({ error: 'Failed to update requisition' }, { status: 500 })
  }
}
