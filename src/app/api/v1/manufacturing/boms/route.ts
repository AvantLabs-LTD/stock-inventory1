import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { normalizeIdempotencyKey } from "@/lib/idempotency"
import { createBillOfMaterial, manufacturingDefinitionApiError } from "@/lib/manufacturing-definitions-service"

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "manufacturing.definitions.manage")) return forbiddenResponse()
  try {
    const body = await request.json()
    const idempotencyKey = normalizeIdempotencyKey(request.headers.get("idempotency-key") || (typeof body.idempotencyKey === "string" ? body.idempotencyKey : null))
    const bom = await createBillOfMaterial(body, { id: session.user.id, name: session.user.name }, idempotencyKey)
    return Response.json({ bom }, { status: 201 })
  } catch (error) { return manufacturingDefinitionApiError(error) }
}
