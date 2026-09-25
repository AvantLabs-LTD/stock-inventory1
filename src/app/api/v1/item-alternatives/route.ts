import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"

const createSchema = z.object({ name: z.string().trim().min(1).max(250), description: z.string().trim().max(2000).nullable().optional(), itemIds: z.array(z.string().cuid()).min(2).max(100) }).strict()

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.view")) return forbiddenResponse()
  const groups = await db.itemAlternativeGroup.findMany({ include: { memberships: { include: { item: { select: { id: true, code: true, title: true, specification: true, unit: true } } }, orderBy: { item: { title: "asc" } } } }, orderBy: { name: "asc" }, take: 500 })
  return Response.json({ groups })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.manage")) return forbiddenResponse()
  try {
    const input = createSchema.parse(await request.json())
    if (new Set(input.itemIds).size !== input.itemIds.length) throw new DomainError("DUPLICATE_ALTERNATIVE_ITEM", "An item may be added only once to an alternative group")
    const actorName = session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name
    const group = await db.$transaction(async tx => {
      const count = await tx.item.count({ where: { id: { in: input.itemIds } } })
      if (count !== input.itemIds.length) throw new DomainError("ITEM_NOT_FOUND", "One or more selected components no longer exist", 404)
      const created = await tx.itemAlternativeGroup.create({ data: { name: input.name, description: input.description || null, createdById: session.user.id, memberships: { create: input.itemIds.map(itemId => ({ itemId })) } }, include: { memberships: true } })
      await tx.auditLog.create({ data: { userId: session.user.id, userName: actorName, action: "CREATE_ITEM_ALTERNATIVE_GROUP", entityType: "ItemAlternativeGroup", entityId: created.id, details: JSON.stringify({ name: created.name, itemIds: input.itemIds }) } })
      return created
    })
    return Response.json({ group }, { status: 201 })
  } catch (error) { return apiError(error) }
}
