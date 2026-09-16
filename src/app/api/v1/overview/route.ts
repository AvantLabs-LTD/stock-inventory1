import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
export async function GET(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.overview.view")) return forbiddenResponse()
  const [items, demands, mine, purchases, stock, quantities] = await Promise.all([
    db.item.count({ where: { status: "ACTIVE" } }), db.demand.count({ where: { state: { in: ["SUBMITTED", "ACTIVE"] } } }),
    db.demand.count({ where: { requestedById: session.user.id, state: { in: ["SUBMITTED", "ACTIVE"] } } }),
    db.purchaseRequest.count({ where: { status: { not: "RECEIVED_IN_STORE" } } }),
    db.itemBalance.aggregate({ _sum: { onHand: true, reserved: true } }),
    db.$queryRaw<Array<{ remaining: Prisma.Decimal; allocated: Prisma.Decimal }>>`SELECT COALESCE(SUM(remaining),0) remaining,COALESCE(SUM(allocated),0) allocated FROM "demand_line_quantities"`,
  ])
  return Response.json({ items, openDemands: demands, myOpenDemands: mine, activePurchases: purchases, onHand: stock._sum.onHand || 0, reserved: stock._sum.reserved || 0, remainingDemand: quantities[0]?.remaining || 0, allocated: quantities[0]?.allocated || 0 })
}
