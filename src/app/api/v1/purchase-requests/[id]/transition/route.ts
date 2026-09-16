import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"
import type { PurchaseRequestStatus } from "@prisma/client"

const next: Partial<Record<PurchaseRequestStatus, PurchaseRequestStatus>> = {
  BACKLOG: "PENDING_ORDER_APPROVAL",
  PENDING_ORDER_APPROVAL: "ORDERED",
  ORDERED: "SHIPPED",
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  try {
    const { id } = await context.params; const body = await request.json()
    const current = await db.purchaseRequest.findUnique({ where: { id } })
    if (!current) throw new DomainError("PURCHASE_NOT_FOUND", "Purchase request not found", 404)
    const target = next[current.status]
    if (!target || target !== body.status) throw new DomainError("INVALID_TRANSITION", "Only the next forward purchase stage is allowed")
    if (target === "ORDERED" && !hasPermission(session, "vault.purchasing.approve")) return forbiddenResponse("Only a purchase approver may approve an order")
    if (target !== "ORDERED" && !hasPermission(session, "vault.purchasing.manage")) return forbiddenResponse()
    const now = new Date()
    const requestRecord = await db.$transaction(async tx => {
      const updated = await tx.purchaseRequest.updateMany({ where: { id, status: current.status }, data: {
        status: target, submittedAt: target === "PENDING_ORDER_APPROVAL" ? now : undefined,
        orderedAt: target === "ORDERED" ? now : undefined, shippedAt: target === "SHIPPED" ? now : undefined,
      } })
      if (updated.count !== 1) throw new DomainError("PURCHASE_CONCURRENT_UPDATE", "The purchase request changed while it was being updated; reload and try again", 409)
      await tx.auditLog.create({ data: {
        userId: session.user.id,
        userName: session.user.name,
        action: "TRANSITION_PURCHASE_REQUEST",
        entityType: "PurchaseRequest",
        entityId: id,
        details: JSON.stringify({ from: current.status, to: target }),
      } })
      return tx.purchaseRequest.findUniqueOrThrow({ where: { id } })
    })
    return Response.json({ request: requestRecord })
  } catch (e) { return apiError(e) }
}
