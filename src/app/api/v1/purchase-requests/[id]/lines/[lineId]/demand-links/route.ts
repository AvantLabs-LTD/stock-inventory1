import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"
import { requireEditableBacklog, validateDemandCoverage } from "@/lib/purchase-service"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; lineId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try {
    const { id, lineId } = await context.params
    const body = await request.json()
    const quantity = new Prisma.Decimal(body.quantity)
    const link = await db.$transaction(async tx => {
      await requireEditableBacklog(tx, id)
      const purchaseLine = await tx.purchaseRequestLine.findFirst({ where: { id: lineId, purchaseRequestId: id }, include: { demandLinks: true } })
      if (!purchaseLine) throw new DomainError("PURCHASE_LINE_NOT_FOUND", "Purchase line not found", 404)
      const linked = purchaseLine.demandLinks.reduce((sum, row) => sum.plus(row.quantity), new Prisma.Decimal(0))
      if (linked.plus(quantity).gt(purchaseLine.quantity)) throw new DomainError("OVER_LINKED_PURCHASE", "Linked demand quantity exceeds the purchase quantity")
      await validateDemandCoverage(tx, { demandLineId: body.demandLineId, itemId: purchaseLine.itemId, quantity })
      return tx.demandPurchaseLink.create({ data: { purchaseRequestLineId: lineId, demandLineId: body.demandLineId, quantity } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return Response.json({ link }, { status: 201 })
  } catch (error) { return apiError(error) }
}
