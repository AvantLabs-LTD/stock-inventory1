import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError } from "@/lib/inventory-service"
import { updateCatalogueItem } from "@/lib/item-service"
import { z } from "zod"

const updateItemSchema = z.object({
  title: z.string().max(250).optional(),
  discipline: z.enum(["MECHANICAL", "ELECTRONICS"]).optional(),
  categoryId: z.string().cuid().nullable().optional(),
  catalogueState: z.enum(["COMPLETE", "INCOMPLETE"]).optional(),
  description: z.string().max(5000).nullable().optional(),
  specification: z.string().max(2000).nullable().optional(),
  manufacturerName: z.string().max(250).nullable().optional(),
  manufacturerPartNumber: z.string().max(250).nullable().optional(),
  supplierPartNumber: z.string().max(250).nullable().optional(),
  function: z.string().max(2000).nullable().optional(),
  link: z.string().max(2000).nullable().optional(),
  optionSelection: z.string().max(1000).nullable().optional(),
  remarks: z.string().max(5000).nullable().optional(),
  unit: z.string().max(50).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
}).strict().refine(value => Object.keys(value).length > 0, "At least one editable field is required")

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse(); if (!hasPermission(session, "vault.catalogue.view")) return forbiddenResponse()
  const { id } = await context.params
  const item = await db.item.findUnique({ where: { id }, include: {
    balance: true, category: { include: { parent: true } },
    demandLines: { include: { demand: true, vendor: true, projectTag: true, suggestedCategory: true }, orderBy: { createdAt: "desc" }, take: 100 },
    purchaseLines: { include: { purchaseRequest: { include: { vendor: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
  } })
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 })
  const auditTrail = hasPermission(session, "vault.catalogue.manage") ? await db.auditLog.findMany({
    where: { entityType: "Item", entityId: id },
    orderBy: { date: "desc" },
    take: 50,
    select: { id: true, userName: true, action: true, details: true, metadata: true, date: true },
  }) : []
  const vendors = new Map<string, unknown>()
  for (const row of item.demandLines) if (row.vendor) vendors.set(row.vendor.id, row.vendor)
  for (const row of item.purchaseLines) if (row.purchaseRequest.vendor) vendors.set(row.purchaseRequest.vendor.id, row.purchaseRequest.vendor)
  return Response.json({ item, observedVendors: [...vendors.values()], auditTrail })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.manage")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const parsed = updateItemSchema.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "Invalid component update", code: "INVALID_ITEM" }, { status: 400 })
    const actorName = session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name
    const item = await db.$transaction(tx => updateCatalogueItem(tx, id, parsed.data, { id: session.user.id, name: actorName }))
    return Response.json({ item })
  } catch (error) { return apiError(error) }
}
