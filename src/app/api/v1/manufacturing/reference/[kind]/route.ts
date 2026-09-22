import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { manufacturingDefinitionApiError, saveReferenceDefinition } from "@/lib/manufacturing-definitions-service"

const kinds = new Set(["operation", "work-center", "resource"])

export async function POST(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "manufacturing.definitions.manage")) return forbiddenResponse()
  const { kind } = await context.params
  if (!kinds.has(kind)) return Response.json({ code: "UNKNOWN_REFERENCE_KIND", error: "Unknown manufacturing reference kind" }, { status: 404 })
  try {
    const record = await saveReferenceDefinition(kind as "operation" | "work-center" | "resource", await request.json(), { id: session.user.id, name: session.user.name })
    return Response.json({ record }, { status: 201 })
  } catch (error) { return manufacturingDefinitionApiError(error) }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "manufacturing.definitions.manage")) return forbiddenResponse()
  const { kind } = await context.params
  if (!kinds.has(kind)) return Response.json({ code: "UNKNOWN_REFERENCE_KIND", error: "Unknown manufacturing reference kind" }, { status: 404 })
  try {
    const record = await saveReferenceDefinition(kind as "operation" | "work-center" | "resource", await request.json(), { id: session.user.id, name: session.user.name })
    return Response.json({ record })
  } catch (error) { return manufacturingDefinitionApiError(error) }
}
