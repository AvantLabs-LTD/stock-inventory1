import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"
import { z } from "zod"

const supplierLinkSchema = z.object({
  vendorId: z.string().cuid().nullable().optional(),
  url: z.string().url().max(2000).refine(value => /^https?:\/\//i.test(value), "Supplier links must use http or https"),
  supplierPartNumber: z.string().max(250).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isPreferred: z.boolean().optional(),
}).strict()

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.view")) return forbiddenResponse()
  const { id } = await context.params
  const item = await db.item.findUnique({ where: { id }, select: { id: true } })
  if (!item) return Response.json({ error: "Item not found", code: "ITEM_NOT_FOUND" }, { status: 404 })
  const links = await db.itemSupplierLink.findMany({
    where: { itemId: id }, include: { vendor: true }, orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
  })
  return Response.json({ links })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.manage")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const parsed = supplierLinkSchema.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "Invalid supplier link", code: "INVALID_SUPPLIER_LINK" }, { status: 400 })
    const input = parsed.data
    const actorName = session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name
    const link = await db.$transaction(async tx => {
      const item = await tx.item.findUnique({ where: { id }, select: { id: true, code: true, title: true } })
      if (!item) throw new DomainError("ITEM_NOT_FOUND", "Component was not found", 404)
      if (input.vendorId) {
        const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true } })
        if (!vendor) throw new DomainError("VENDOR_NOT_FOUND", "Vendor was not found", 404)
      }
      const created = await tx.itemSupplierLink.create({ data: {
        itemId: id, vendorId: input.vendorId || null, url: input.url.trim(),
        supplierPartNumber: input.supplierPartNumber?.trim() || null, notes: input.notes?.trim() || null,
        isPreferred: input.isPreferred ?? false,
      }, include: { vendor: true } })
      await tx.auditLog.create({ data: {
        userId: session.user.id, userName: actorName, action: "CREATE_ITEM_SUPPLIER_LINK", entityType: "ItemSupplierLink", entityId: created.id,
        rootEntityType: "Item", rootEntityId: id,
        details: JSON.stringify({ itemCode: item.code, itemTitle: item.title, url: created.url, vendorId: created.vendorId }),
      } })
      return created
    })
    return Response.json({ link }, { status: 201 })
  } catch (error) { return apiError(error) }
}
