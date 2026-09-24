import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { manufacturingDefinitionApiError, manufacturingPlanningRollup } from "@/lib/manufacturing-definitions-service"
import { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "manufacturing.view")) return forbiddenResponse()
  try {
    return Response.json(await manufacturingPlanningRollup())
  } catch (error) {
    return manufacturingDefinitionApiError(error)
  }
}
