import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, cancelDemand, DomainError } from "@/lib/inventory-service"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse(); if (!hasPermission(session, "vault.demands.view")) return forbiddenResponse()
  const { id } = await context.params
  const demand = await db.demand.findUnique({ where: { id }, include: {
    departmentTag: true, requestedBy: { select: { id: true, name: true, email: true } },
    lines: { include: {
      item: { include: { balance: true, category: true } }, projectTag: true, suggestedCategory: true, vendor: true,
      approvedBy: { select: { id: true, name: true } }, approvalRevisions: { include: { createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      issueLines: { include: { issue: true, returnLines: true }, orderBy: { createdAt: "asc" } },
      purchaseLinks: { include: { purchaseRequestLine: { include: { receiptLines: true, purchaseRequest: { include: { vendor: true } } } } } },
    }, orderBy: { sortOrder: "asc" } },
  } })
  if (!demand) return Response.json({ error: "Demand not found" }, { status: 404 })
  const quantities = await db.$queryRaw<Array<Record<string, Prisma.Decimal | string | null>>>
    `SELECT q.*,COALESCE(s."physicalDeficit",0) "physicalDeficit",COALESCE(s."unprocuredDeficit",0) "unprocuredDeficit",COALESCE(s."stockFacet",'COMPLETE') "stockFacet"
     FROM "demand_line_quantities" q LEFT JOIN "demand_line_supply" s ON s."demandLineId"=q."demandLineId"
     WHERE q."demandId"=${id}`
  const byLine = new Map(quantities.map(q => [String(q.demandLineId), q]))
  return Response.json({ demand: { ...demand, lines: demand.lines.map(line => ({ ...line, quantities: byLine.get(line.id) })) } })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.demands.manage")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const body = await request.json()
    if (!["ACTIVE", "CLOSED", "CANCELLED"].includes(body.state)) throw new DomainError("INVALID_STATE", "Invalid demand state")
    if (body.state === "CLOSED") {
      const rows = await db.$queryRaw<Array<{ count: bigint }>>
        `SELECT COUNT(*) count FROM "demand_line_quantities" WHERE "demandId"=${id} AND remaining > 0`
      if (Number(rows[0]?.count || 0) > 0) throw new DomainError("DEMAND_INCOMPLETE", "Issue or cancel every remaining approved quantity before closing")
    }
    if (body.state === "CANCELLED") {
      const cancelled = await cancelDemand({ demandId: id, actorId: session.user.id, actorName: session.user.name, reason: body.reason })
      return Response.json({ demand: cancelled })
    }
    const data = body.state === "ACTIVE"
      ? { state: "ACTIVE" as const, startedAt: new Date(), startedById: session.user.id }
      : body.state === "CLOSED"
        ? { state: "CLOSED" as const, closedAt: new Date(), closedById: session.user.id }
        : { state: "CLOSED" as const, closedAt: new Date(), closedById: session.user.id }
    return Response.json({ demand: await db.demand.update({ where: { id }, data }) })
  } catch (error) { return apiError(error) }
}
