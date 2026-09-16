import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, cancelDemandLine } from "@/lib/inventory-service"
export async function POST(request: NextRequest, context: { params: Promise<{ lineId: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.demands.manage")) return forbiddenResponse()
  try {
    const { lineId } = await context.params; const body = await request.json()
    const result = await cancelDemandLine({
      lineId, actorId: session.user.id, actorName: session.user.name,
      quantity: body.quantity, fromStockQuantity: body.fromStockQuantity, forProcurementQuantity: body.forProcurementQuantity,
      reason: body.reason, idempotencyKey: body.idempotencyKey,
    })
    return Response.json({ cancellation: result }, { status: 201 })
  } catch (e) { return apiError(e) }
}
