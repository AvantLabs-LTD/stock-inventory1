import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { normalizeIdempotencyKey } from "@/lib/idempotency"
import { apiError, issueDemand } from "@/lib/inventory-service"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.demands.issue")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const body = await request.json()
    return Response.json({ issue: await issueDemand({
      demandId: id,
      actorId: session.user.id,
      actorName: session.user.name,
      idempotencyKey: normalizeIdempotencyKey(typeof body.idempotencyKey === "string" ? body.idempotencyKey : null) || undefined,
      remarks: body.remarks,
      lines: body.lines || [],
    }) }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
