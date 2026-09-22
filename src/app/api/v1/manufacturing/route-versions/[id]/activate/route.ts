import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { activateRouteVersion, manufacturingDefinitionApiError } from "@/lib/manufacturing-definitions-service"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "manufacturing.definitions.manage")) return forbiddenResponse()
  try {
    const { id } = await context.params
    return Response.json({ version: await activateRouteVersion(id, { id: session.user.id, name: session.user.name }) })
  } catch (error) { return manufacturingDefinitionApiError(error) }
}
