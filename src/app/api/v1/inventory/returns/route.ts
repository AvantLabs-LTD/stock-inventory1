import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, returnIssuedStock } from "@/lib/inventory-service"
export async function POST(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try { const b = await request.json()
    return Response.json({ return: await returnIssuedStock({ ...b, actorId: session.user.id, actorName: session.user.name, lines: b.lines || [] }) }, { status: 201 })
  } catch (e) { return apiError(e) }
}
