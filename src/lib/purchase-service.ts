import { Prisma, PurchaseRequestStatus } from "@prisma/client"
import { DomainError } from "@/lib/inventory-service"

type TransactionClient = Prisma.TransactionClient

export const ACTIVE_PURCHASE_STATUSES: PurchaseRequestStatus[] = ["BACKLOG", "PENDING_APPROVAL", "ORDERED", "SHIPPED"]

export async function validateDemandCoverage(
  tx: TransactionClient,
  input: { demandLineId: string; itemId: string; quantity: Prisma.Decimal; existingQuantity?: Prisma.Decimal },
) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "demand_lines" WHERE "id"=${input.demandLineId} FOR UPDATE`)
  const rows = await tx.$queryRaw<Array<{
    itemId: string | null
    state: string
    remaining: Prisma.Decimal
    unprocuredDeficit: Prisma.Decimal
  }>>(Prisma.sql`
    SELECT q."itemId",d."state",q.remaining,COALESCE(s."unprocuredDeficit",0) "unprocuredDeficit"
    FROM "demand_line_quantities" q
    JOIN "demands" d ON d."id"=q."demandId"
    LEFT JOIN "demand_line_supply" s ON s."demandLineId"=q."demandLineId"
    WHERE q."demandLineId"=${input.demandLineId}
  `)
  const demand = rows[0]
  if (!demand || demand.itemId !== input.itemId || !["SUBMITTED", "ACTIVE"].includes(demand.state)) {
    throw new DomainError("INVALID_DEMAND_LINK", "Purchase coverage must target an open demand row for the same component")
  }
  if (input.quantity.lte(0)) throw new DomainError("INVALID_QUANTITY", "Linked coverage must be positive")
  const availableGap = demand.unprocuredDeficit.plus(input.existingQuantity || 0)
  if (input.quantity.gt(availableGap)) {
    throw new DomainError("DEMAND_OVER_COVERAGE", `Linked coverage exceeds the demand's unprocured deficit of ${availableGap.toString()}`)
  }
  return demand
}

export async function requireEditableBacklog(tx: TransactionClient, purchaseRequestId: string) {
  const purchase = await tx.purchaseRequest.findUnique({ where: { id: purchaseRequestId } })
  if (!purchase) throw new DomainError("PURCHASE_NOT_FOUND", "Purchase request not found", 404)
  if (purchase.status !== "BACKLOG") throw new DomainError("PURCHASE_NOT_EDITABLE", "Demand coverage can only be changed while the purchase is in backlog")
  return purchase
}
