import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, returnAllocation } from "@/lib/inventory-service"
export async function POST(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try { const b = await request.json()
    return Response.json({ return: await returnAllocation({ ...b, actorId: session.user.id, lines: b.lines || [] }) }, { status: 201 })
  } catch (e) { return apiError(e) }
}
