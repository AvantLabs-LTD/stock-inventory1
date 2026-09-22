import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { normalizeIdempotencyKey } from "@/lib/idempotency"
import { apiError, DomainError } from "@/lib/inventory-service"
import { postGoodsReceipt } from "@/lib/purchase-service"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.purchasing.receive")) return forbiddenResponse()

  try {
    const { id } = await context.params
    const rawBody: unknown = await request.json()
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      throw new DomainError("INVALID_REQUEST_BODY", "A JSON object is required")
    }
    const body = rawBody as Record<string, unknown>
    return Response.json({ receipt: await postGoodsReceipt({
      purchaseRequestId: id,
      actorId: session.user.id,
      actorName: session.user.name,
      idempotencyKey: normalizeIdempotencyKey(typeof body.idempotencyKey === "string" ? body.idempotencyKey : null) || undefined,
      remarks: typeof body.remarks === "string" ? body.remarks.trim() || undefined : undefined,
      lines: body.lines,
    }) }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
