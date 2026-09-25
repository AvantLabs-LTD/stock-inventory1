import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"
import { z } from "zod"

const updateSchema = z.object({
  vendorId: z.string().cuid().nullable().optional(),
  url: z.string().url().max(2000).refine(value => /^https?:\/\//i.test(value), "Supplier links must use http or https").optional(),
  supplierPartNumber: z.string().max(250).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  optionSelection: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isPreferred: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, "At least one editable field is required")

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; linkId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.manage")) return forbiddenResponse()
  try {
    const { id, linkId } = await context.params
    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "Invalid supplier link", code: "INVALID_SUPPLIER_LINK" }, { status: 400 })
    const input = parsed.data
    const actorName = session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name
    const link = await db.$transaction(async tx => {
      const existing = await tx.itemSupplierLink.findFirst({ where: { id: linkId, itemId: id } })
      if (!existing) throw new DomainError("ITEM_SUPPLIER_LINK_NOT_FOUND", "Supplier link was not found", 404)
      if (input.vendorId) {
        const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true } })
        if (!vendor) throw new DomainError("VENDOR_NOT_FOUND", "Vendor was not found", 404)
      }
      if (input.url && input.url.trim() !== existing.url) {
        const duplicate = await tx.itemSupplierLink.findFirst({ where: { itemId: id, url: input.url.trim(), id: { not: linkId } }, select: { id: true } })
        if (duplicate) throw new DomainError("ITEM_SUPPLIER_LINK_EXISTS", "This supplier link is already recorded for the component", 409)
      }
      const data = {
        ...(input.vendorId !== undefined ? { vendorId: input.vendorId } : {}),
        ...(input.url !== undefined ? { url: input.url.trim() } : {}),
        ...(input.supplierPartNumber !== undefined ? { supplierPartNumber: input.supplierPartNumber?.trim() || null } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.optionSelection !== undefined ? { optionSelection: input.optionSelection?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.isPreferred !== undefined ? { isPreferred: input.isPreferred } : {}),
      }
      const updated = await tx.itemSupplierLink.update({ where: { id: linkId }, data, include: { vendor: true } })
      await tx.auditLog.create({ data: {
        userId: session.user.id, userName: actorName, action: "UPDATE_ITEM_SUPPLIER_LINK", entityType: "ItemSupplierLink", entityId: linkId,
        rootEntityType: "Item", rootEntityId: id, details: JSON.stringify({ before: existing, after: data }),
      } })
      return updated
    })
    return Response.json({ link })
  } catch (error) { return apiError(error) }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; linkId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.manage")) return forbiddenResponse()
  try {
    const { id, linkId } = await context.params
    const actorName = session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name
    await db.$transaction(async tx => {
      const existing = await tx.itemSupplierLink.findFirst({ where: { id: linkId, itemId: id } })
      if (!existing) throw new DomainError("ITEM_SUPPLIER_LINK_NOT_FOUND", "Supplier link was not found", 404)
      await tx.itemSupplierLink.delete({ where: { id: linkId } })
      await tx.auditLog.create({ data: {
        userId: session.user.id, userName: actorName, action: "DELETE_ITEM_SUPPLIER_LINK", entityType: "ItemSupplierLink", entityId: linkId,
        rootEntityType: "Item", rootEntityId: id, details: JSON.stringify({ deleted: existing }),
      } })
    })
    return new Response(null, { status: 204 })
  } catch (error) { return apiError(error) }
}
