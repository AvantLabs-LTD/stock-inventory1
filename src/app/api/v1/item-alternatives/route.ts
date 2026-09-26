import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { saveAlternativeGroup, optimizationError } from "@/lib/item-optimization-service"

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.view") && !hasPermission(session, "manufacturing.view")) return forbiddenResponse()
  try {
    const page = z.coerce.number().int().min(1).max(100000).parse(request.nextUrl.searchParams.get("page") || 1)
    const groups = await db.itemAlternativeGroup.findMany({ include: { memberships: { include: { item: { select: { id: true, code: true, title: true, specification: true, unit: true, discipline: true, status: true } } }, orderBy: { itemId: "asc" } } }, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * 100, take: 101 })
    return Response.json({ groups: groups.slice(0,100), hasMore: groups.length > 100 })
  } catch (error) { return optimizationError(error) }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.manage")) return forbiddenResponse()
  try {
    const name = session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name
    return Response.json({ group: await saveAlternativeGroup(await request.json(), { id: session.user.id, name }) }, { status: 201 })
  } catch (error) { return optimizationError(error) }
}
