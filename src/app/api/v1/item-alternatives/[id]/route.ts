import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { saveAlternativeGroup, deleteAlternativeGroup, optimizationError } from "@/lib/item-optimization-service"

async function change(request: NextRequest, context: {params: Promise<{id:string}>}, remove: boolean) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.manage")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const actor = { id: session.user.id, name: session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name }
    if (remove) { await deleteAlternativeGroup(id, actor); return new Response(null, { status: 204 }) }
    return Response.json({ group: await saveAlternativeGroup(await request.json(), actor, id) })
  } catch (error) { return optimizationError(error) }
}
export const PATCH = (request: NextRequest, context: {params: Promise<{id:string}>}) => change(request, context, false)
export const DELETE = (request: NextRequest, context: {params: Promise<{id:string}>}) => change(request, context, true)
