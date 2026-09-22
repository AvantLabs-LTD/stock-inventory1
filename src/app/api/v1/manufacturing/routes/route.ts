import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { createManufacturingRoute, manufacturingDefinitionApiError } from "@/lib/manufacturing-definitions-service"

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "manufacturing.definitions.manage")) return forbiddenResponse()
  try {
    const route = await createManufacturingRoute(await request.json(), { id: session.user.id, name: session.user.name })
    return Response.json({ route }, { status: 201 })
  } catch (error) { return manufacturingDefinitionApiError(error) }
}
