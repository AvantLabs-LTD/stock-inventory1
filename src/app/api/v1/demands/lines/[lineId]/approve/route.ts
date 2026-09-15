import { NextRequest } from "next/server"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, approveDemandLine } from "@/lib/inventory-service"

export async function POST(request: NextRequest, context: { params: Promise<{ lineId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try {
    const { lineId } = await context.params
    const body = await request.json()
    return Response.json({ approval: await approveDemandLine({
      lineId,
      actorId: session.user.id,
      actorName: session.user.name,
      approvedQuantity: body.approvedQuantity,
      fromStockQuantity: body.fromStockQuantity,
      forProcurementQuantity: body.forProcurementQuantity,
      remarks: body.remarks,
    }) }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
