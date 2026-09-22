import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { createManufacturingProfile, listManufacturingDefinitions, manufacturingDefinitionApiError } from "@/lib/manufacturing-definitions-service"

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "manufacturing.view")) return forbiddenResponse()
  try {
    return Response.json(await listManufacturingDefinitions())
  } catch (error) { return manufacturingDefinitionApiError(error) }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "manufacturing.definitions.manage")) return forbiddenResponse()
  try {
    const profile = await createManufacturingProfile(await request.json(), { id: session.user.id, name: session.user.name })
    return Response.json({ profile }, { status: 201 })
  } catch (error) { return manufacturingDefinitionApiError(error) }
}
