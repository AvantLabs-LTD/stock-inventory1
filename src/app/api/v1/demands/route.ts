import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, createDemand } from "@/lib/inventory-service"

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.demands.view")) return forbiddenResponse()
  const mine = request.nextUrl.searchParams.get("mine") === "true"
  const state = request.nextUrl.searchParams.get("state")
  const demands = await db.demand.findMany({
    where: { requestedById: mine ? session.user.id : undefined, state: state && state !== "ALL" ? state as never : undefined },
    include: { departmentTag: true, requestedBy: { select: { id: true, name: true } }, lines: { select: { id: true } } },
    orderBy: { requestedAt: "desc" }, take: 200,
  })
  const demandIds = demands.map(demand => demand.id)
  const totals = demandIds.length ? await db.$queryRaw<Array<{ demandId: string; requested: Prisma.Decimal; approved: Prisma.Decimal; allocated: Prisma.Decimal; netIssued: Prisma.Decimal; remaining: Prisma.Decimal }>>(Prisma.sql`
    SELECT "demandId",SUM(requested) requested,SUM(approved) approved,SUM(allocated) allocated,SUM("netIssued") "netIssued",SUM(remaining) remaining
    FROM "demand_line_quantities" WHERE "demandId" IN (${Prisma.join(demandIds)}) GROUP BY "demandId"
  `) : []
  const byId = new Map(totals.map(x => [x.demandId, x]))
  return Response.json({ demands: demands.map(d => ({ ...d, quantities: byId.get(d.id) || null })) })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.demands.create")) return forbiddenResponse()
  try {
    const body = await request.json()
    const demand = await createDemand({ ...body, requestedById: session.user.id })
    return Response.json({ demand }, { status: 201 })
  } catch (error) { return apiError(error) }
}
