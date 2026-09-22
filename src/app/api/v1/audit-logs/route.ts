import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
export async function GET(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse(); if (!hasPermission(session, "flux.audit.view")) return forbiddenResponse()
  const query = z.object({
    entityType: z.string().trim().max(100).optional(),
    entityId: z.string().trim().max(100).optional(),
    rootEntityType: z.string().trim().max(100).optional(),
    rootEntityId: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).refine(value => Boolean(value.entityType) === Boolean(value.entityId), {
    message: "entityType and entityId must be provided together",
  }).refine(value => Boolean(value.rootEntityType) === Boolean(value.rootEntityId), {
    message: "rootEntityType and rootEntityId must be provided together",
  }).safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()))
  if (!query.success) return Response.json({ code: "INVALID_FILTER", error: "Invalid audit-log filter" }, { status: 400 })
  const where = {
    ...(query.data.entityType ? { entityType: query.data.entityType, entityId: query.data.entityId } : {}),
    ...(query.data.rootEntityType ? { rootEntityType: query.data.rootEntityType, rootEntityId: query.data.rootEntityId } : {}),
  }
  return Response.json({ logs: await db.auditLog.findMany({ where, orderBy: { date: "desc" }, take: query.data.limit }) })
}
