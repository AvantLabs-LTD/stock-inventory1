import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, createDemand } from "@/lib/inventory-service"

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  const mine = request.nextUrl.searchParams.get("mine") === "true"
  const state = request.nextUrl.searchParams.get("state")
  const demands = await db.demand.findMany({
    where: { requestedById: mine ? session.user.id : undefined, state: state && state !== "ALL" ? state as never : undefined },
    include: { departmentTag: true, requestedBy: { select: { id: true, name: true } }, lines: { select: { id: true } } },
    orderBy: { requestedAt: "desc" }, take: 200,
  })
  const totals = await db.$queryRaw<Array<{ demandId: string; required: Prisma.Decimal; allocated: Prisma.Decimal; remaining: Prisma.Decimal; reserved: Prisma.Decimal }>>
    `SELECT "demandId",SUM(required) required,SUM(allocated) allocated,SUM(remaining) remaining,SUM(reserved) reserved FROM "demand_line_quantities" GROUP BY "demandId"`
  const byId = new Map(totals.map(x => [x.demandId, x]))
  return Response.json({ demands: demands.map(d => ({ ...d, quantities: byId.get(d.id) || null })) })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  try {
    const body = await request.json()
    const demand = await createDemand({ ...body, requestedById: session.user.id })
    return Response.json({ demand }, { status: 201 })
  } catch (error) { return apiError(error) }
}
