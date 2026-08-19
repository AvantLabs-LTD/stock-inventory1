import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { PurchaseRequestDomainError, updatePurchaseReservationLink } from '@/lib/inventory/purchase-request-service'
import { hasPermission } from '@/lib/permissions'
import { purchaseLinkUpdateSchema } from '@/lib/validation/purchase-request'

async function perform(requestId: string, linkId: string, quantity?: string | number) {
  try {
    return Response.json({ data: await updatePurchaseReservationLink({ requestId, linkId, quantity }) })
  } catch (error) {
    if (error instanceof PurchaseRequestDomainError) {
      return Response.json({ error: error.message }, { status: error.code === 'NOT_FOUND' ? 404 : 409 })
    }
    throw error
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'edit')) return forbiddenResponse()
  const parsed = purchaseLinkUpdateSchema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'Invalid link quantity', details: parsed.error.flatten() }, { status: 400 })
  const route = await params
  return perform(route.id, route.linkId, parsed.data.quantity)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'edit')) return forbiddenResponse()
  const route = await params
  return perform(route.id, route.linkId)
}
