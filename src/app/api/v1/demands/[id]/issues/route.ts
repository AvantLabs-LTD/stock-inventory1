import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, issueDemand } from "@/lib/inventory-service"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const body = await request.json()
    return Response.json({ issue: await issueDemand({
      demandId: id,
      actorId: session.user.id,
      actorName: session.user.name,
      idempotencyKey: body.idempotencyKey,
      remarks: body.remarks,
      lines: body.lines || [],
    }) }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
