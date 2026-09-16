import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError } from "@/lib/inventory-service"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request); if (!session) return unauthorizedResponse(); if (!hasPermission(session, "vault.catalogue.view")) return forbiddenResponse()
  const { id } = await context.params
  const item = await db.item.findUnique({ where: { id }, include: {
    balance: true, category: { include: { parent: true } },
    demandLines: { include: { demand: true, vendor: true, projectTag: true, suggestedCategory: true }, orderBy: { createdAt: "desc" }, take: 100 },
    purchaseLines: { include: { purchaseRequest: { include: { vendor: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
  } })
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 })
  const vendors = new Map<string, unknown>()
  for (const row of item.demandLines) if (row.vendor) vendors.set(row.vendor.id, row.vendor)
  for (const row of item.purchaseLines) if (row.purchaseRequest.vendor) vendors.set(row.purchaseRequest.vendor.id, row.purchaseRequest.vendor)
  return Response.json({ item, observedVendors: [...vendors.values()] })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.catalogue.manage")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const body = await request.json()
    const item = await db.item.update({ where: { id }, data: {
      code: body.code?.trim(), title: body.title?.trim(), discipline: body.discipline,
      categoryId: body.categoryId, catalogueState: body.catalogueState,
      description: body.description, specification: body.specification, manufacturerName: body.manufacturerName,
      manufacturerPartNumber: body.manufacturerPartNumber, supplierPartNumber: body.supplierPartNumber,
      function: body.function, link: body.link,
      optionSelection: body.optionSelection, remarks: body.remarks, unit: body.unit?.trim(),
      status: body.status,
    } })
    return Response.json({ item })
  } catch (error) { return apiError(error) }
}
