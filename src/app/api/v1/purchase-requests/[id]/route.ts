import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { getPurchaseRequest, PurchaseRequestDomainError, updatePurchaseRequestDetails } from '@/lib/inventory/purchase-request-service'
import { hasPermission } from '@/lib/permissions'
import { purchaseRequestUpdateSchema } from '@/lib/validation/purchase-request'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'view')) return forbiddenResponse()
  try {
    return Response.json({ data: await getPurchaseRequest((await params).id) })
  } catch (error) {
    if (error instanceof PurchaseRequestDomainError) return Response.json({ error: error.message }, { status: 404 })
    throw error
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'edit')) return forbiddenResponse()
  const parsed = purchaseRequestUpdateSchema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'Invalid purchase details', details: parsed.error.flatten() }, { status: 400 })
  try {
    return Response.json({ data: await updatePurchaseRequestDetails({ id: (await params).id, ...parsed.data }) })
  } catch (error) {
    if (error instanceof PurchaseRequestDomainError) {
      return Response.json({ error: error.message }, { status: error.code === 'NOT_FOUND' ? 404 : 409 })
    }
    throw error
  }
}
