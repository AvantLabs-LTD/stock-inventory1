import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { normalizeIdempotencyKey } from "@/lib/idempotency"
import { adjustInventory, apiError } from "@/lib/inventory-service"

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.stock.adjust")) return forbiddenResponse()
  try {
    const body = await request.json()
    const adjustment = await adjustInventory({
      actorId: session.user.id,
      actorName: session.user.name,
      idempotencyKey: normalizeIdempotencyKey(typeof body.idempotencyKey === "string" ? body.idempotencyKey : null) || undefined,
      reason: body.reason,
      remarks: body.remarks,
      lines: body.lines || [],
    })
    return Response.json({ adjustment }, { status: 201 })
  } catch (e) { return apiError(e) }
}
