import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, reserveLine } from "@/lib/inventory-service"
export async function POST(request: NextRequest, context: { params: Promise<{ lineId: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try { const { lineId } = await context.params; const b = await request.json()
    return Response.json({ reservation: await reserveLine({ lineId, quantity: b.quantity, actorId: session.user.id, sourceId: b.idempotencyKey || crypto.randomUUID(), remarks: b.remarks }) }, { status: 201 })
  } catch (e) { return apiError(e) }
}
