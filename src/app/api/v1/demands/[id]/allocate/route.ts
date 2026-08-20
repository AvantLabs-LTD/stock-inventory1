import { NextRequest } from "next/server"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { allocateDemand, apiError } from "@/lib/inventory-service"
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  try { const { id } = await context.params; const b = await request.json()
    return Response.json({ allocation: await allocateDemand({ demandId: id, actorId: session.user.id, idempotencyKey: b.idempotencyKey, remarks: b.remarks, lines: b.lines || [] }) }, { status: 201 })
  } catch (e) { return apiError(e) }
}
