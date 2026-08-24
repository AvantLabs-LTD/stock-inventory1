import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { adjustInventory, apiError } from "@/lib/inventory-service"

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try {
    const body = await request.json()
    const adjustment = await adjustInventory({
      actorId: session.user.id,
      actorName: session.user.name,
      idempotencyKey: body.idempotencyKey,
      reason: body.reason,
      remarks: body.remarks,
      lines: body.lines || [],
    })
    return Response.json({ adjustment }, { status: 201 })
  } catch (e) { return apiError(e) }
}
