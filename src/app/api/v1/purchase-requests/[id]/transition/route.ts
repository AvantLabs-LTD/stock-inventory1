import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"

const next: Record<string, string> = { BACKLOG: "PENDING_APPROVAL", PENDING_APPROVAL: "ORDERED", ORDERED: "SHIPPED" }
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  try {
    const { id } = await context.params; const body = await request.json()
    const current = await db.purchaseRequest.findUnique({ where: { id } })
    if (!current) throw new DomainError("PURCHASE_NOT_FOUND", "Purchase request not found", 404)
    if (next[current.status] !== body.status) throw new DomainError("INVALID_TRANSITION", "Only the next forward purchase stage is allowed")
    if (body.status === "ORDERED" && !hasRole(session, "PURCHASE_APPROVER")) return forbiddenResponse("Only a purchase approver may approve an order")
    if (body.status !== "ORDERED" && !hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
    const now = new Date()
    const requestRecord = await db.purchaseRequest.update({ where: { id }, data: {
      status: body.status, submittedAt: body.status === "PENDING_APPROVAL" ? now : undefined,
      orderedAt: body.status === "ORDERED" ? now : undefined, shippedAt: body.status === "SHIPPED" ? now : undefined,
    } })
    return Response.json({ request: requestRecord })
  } catch (e) { return apiError(e) }
}
