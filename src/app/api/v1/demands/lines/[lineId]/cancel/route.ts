import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"
export async function POST(request: NextRequest, context: { params: Promise<{ lineId: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try {
    const { lineId } = await context.params; const body = await request.json()
    const amount = new Prisma.Decimal(body.quantity)
    const result = await db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ itemId: string | null; remaining: Prisma.Decimal; reserved: Prisma.Decimal }>>
        `SELECT "itemId",remaining,reserved FROM "demand_line_quantities" WHERE "demandLineId"=${lineId}`
      const q = rows[0]
      if (!q || amount.lte(0) || amount.gt(q.remaining)) throw new DomainError("OVER_CANCELLATION", "Cancellation exceeds remaining demand")
      const release = Prisma.Decimal.min(q.reserved, amount)
      if (release.gt(0) && q.itemId) {
        await tx.demandReservationEntry.create({ data: { demandLineId: lineId, type: "RELEASE", quantity: release, sourceId: (body.idempotencyKey || crypto.randomUUID()) + "-release", createdById: session.user.id, remarks: "Released by cancellation" } })
        await tx.itemBalance.update({ where: { itemId: q.itemId }, data: { reserved: { decrement: release }, version: { increment: 1 } } })
      }
      return tx.demandLineCancellation.create({ data: { demandLineId: lineId, quantity: amount, reason: body.reason?.trim() || "Cancelled", sourceId: body.idempotencyKey || crypto.randomUUID(), createdById: session.user.id } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return Response.json({ cancellation: result }, { status: 201 })
  } catch (e) { return apiError(e) }
}
