import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { PurchaseRequestDomainError, transitionPurchaseRequest } from '@/lib/inventory/purchase-request-service'
import { hasPermission } from '@/lib/permissions'
import { purchaseRequestTransitionSchema } from '@/lib/validation/purchase-request'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'view')) return forbiddenResponse()
  const parsed = purchaseRequestTransitionSchema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'Invalid lifecycle transition', details: parsed.error.flatten() }, { status: 400 })
  try {
    const data = await transitionPurchaseRequest({
      id: (await params).id,
      target: parsed.data.status,
      actorId: session.user.id,
      actorMayOrder: hasPermission(session.user.role, 'purchase_requests', 'approve'),
      actorMayManage: hasPermission(session.user.role, 'purchase_requests', 'manage'),
    })
    return Response.json({ data })
  } catch (error) {
    if (error instanceof PurchaseRequestDomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 409
      return Response.json({ error: error.message }, { status })
    }
    throw error
  }
}
