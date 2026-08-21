import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try {
    const { id } = await context.params; const body = await request.json()
    const result = await db.$transaction(async tx => {
      if (body.idempotencyKey) {
        const found = await tx.goodsReceipt.findUnique({ where: { idempotencyKey: body.idempotencyKey }, include: { lines: true } })
        if (found) return found
      }
      const purchase = await tx.purchaseRequest.findUnique({ where: { id }, include: { lines: { include: { receiptLines: true } } } })
      if (!purchase || !["ORDERED", "SHIPPED"].includes(purchase.status)) throw new DomainError("PURCHASE_NOT_RECEIVABLE", "Only ordered or shipped requests may be received")
      const receipt = await tx.goodsReceipt.create({ data: { receiptNo: "REC-" + Date.now() + "-" + Math.floor(Math.random()*1000), purchaseRequestId: id, postedById: session.user.id, idempotencyKey: body.idempotencyKey, remarks: body.remarks } })
      for (const row of body.lines || []) {
        const amount = new Prisma.Decimal(row.quantity)
        const purchaseLine = purchase.lines.find(x => x.id === row.purchaseRequestLineId)
        if (!purchaseLine || amount.lte(0)) throw new DomainError("INVALID_RECEIPT_LINE", "Invalid receipt row")
        const received = purchaseLine.receiptLines.reduce((n, x) => n.plus(x.quantity), new Prisma.Decimal(0))
        if (received.plus(amount).gt(purchaseLine.quantity)) throw new DomainError("OVER_RECEIPT", "Receipt exceeds ordered quantity")
        const line = await tx.goodsReceiptLine.create({ data: { receiptId: receipt.id, purchaseRequestLineId: purchaseLine.id, itemId: purchaseLine.itemId, quantity: amount, unitCost: row.unitCost, remarks: row.remarks } })
        const stock = await tx.itemBalance.upsert({ where: { itemId: purchaseLine.itemId }, update: {}, create: { itemId: purchaseLine.itemId } })
        const after = stock.onHand.plus(amount)
        await tx.itemBalance.update({ where: { itemId: purchaseLine.itemId }, data: { onHand: after, version: { increment: 1 } } })
        await tx.inventoryLedgerEntry.create({ data: { itemId: purchaseLine.itemId, type: "RECEIPT", quantity: amount, onHandAfter: after, sourceType: "GOODS_RECEIPT", sourceId: receipt.id, sourceLineId: line.id, actorId: session.user.id, remarks: row.remarks } })
      }
      const allLines = await tx.purchaseRequestLine.findMany({ where: { purchaseRequestId: id }, include: { receiptLines: true } })
      if (allLines.every(line => line.receiptLines.reduce((n,x)=>n.plus(x.quantity),new Prisma.Decimal(0)).gte(line.quantity))) {
        await tx.purchaseRequest.update({ where: { id }, data: { status: "RECEIVED_IN_STORE", receivedAt: new Date() } })
      }
      return tx.goodsReceipt.findUnique({ where: { id: receipt.id }, include: { lines: true } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return Response.json({ receipt: result }, { status: 201 })
  } catch (e) { return apiError(e) }
}
