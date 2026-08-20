import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"
export async function POST(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  try { const body = await request.json()
    const adjustment = await db.$transaction(async tx => {
      const header = await tx.inventoryAdjustment.create({ data: { adjustmentNo: "ADJ-" + Date.now(), postedById: session.user.id, idempotencyKey: body.idempotencyKey, reason: body.reason || "Stock adjustment", remarks: body.remarks } })
      for (const row of body.lines || []) {
        const amount = new Prisma.Decimal(row.quantity)
        if (amount.eq(0)) throw new DomainError("INVALID_QUANTITY", "Adjustment cannot be zero")
        const stock = await tx.itemBalance.upsert({ where: { itemId: row.itemId }, update: {}, create: { itemId: row.itemId } })
        const after = stock.onHand.plus(amount)
        if (after.lt(stock.reserved) || after.lt(0)) throw new DomainError("ADJUSTMENT_BELOW_COMMITTED", "Adjustment would make stock negative or below reserved stock")
        const line = await tx.inventoryAdjustmentLine.create({ data: { adjustmentId: header.id, itemId: row.itemId, quantity: amount, remarks: row.remarks } })
        await tx.itemBalance.update({ where: { itemId: row.itemId }, data: { onHand: after, version: { increment: 1 } } })
        await tx.inventoryLedgerEntry.create({ data: { itemId: row.itemId, type: amount.gt(0) ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", quantity: amount, onHandAfter: after, sourceType: "INVENTORY_ADJUSTMENT", sourceId: header.id, sourceLineId: line.id, actorId: session.user.id, remarks: row.remarks } })
      }
      return tx.inventoryAdjustment.findUnique({ where: { id: header.id }, include: { lines: true } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return Response.json({ adjustment }, { status: 201 })
  } catch (e) { return apiError(e) }
}
