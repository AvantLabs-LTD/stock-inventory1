import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { normalizeIdempotencyKey } from "@/lib/idempotency"
import { manufacturingDefinitionApiError, replaceDraftBomVersion } from "@/lib/manufacturing-definitions-service"

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "manufacturing.definitions.manage")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const body = await request.json()
    const idempotencyKey = normalizeIdempotencyKey(request.headers.get("idempotency-key") || (typeof body.idempotencyKey === "string" ? body.idempotencyKey : null))
    return Response.json({ version: await replaceDraftBomVersion(id, body, { id: session.user.id, name: session.user.name }, idempotencyKey) })
  } catch (error) { return manufacturingDefinitionApiError(error) }
}
