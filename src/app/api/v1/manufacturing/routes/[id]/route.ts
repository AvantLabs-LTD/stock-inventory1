import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { manufacturingDefinitionApiError, routeDetail } from "@/lib/manufacturing-definitions-service"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "manufacturing.view")) return forbiddenResponse()
  try {
    const { id } = await context.params
    return Response.json({ route: await routeDetail(id) })
  } catch (error) { return manufacturingDefinitionApiError(error) }
}
