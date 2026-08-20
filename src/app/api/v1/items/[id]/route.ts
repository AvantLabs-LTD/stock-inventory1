import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError } from "@/lib/inventory-service"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await getSession(request)) return unauthorizedResponse()
  const { id } = await context.params
  const item = await db.item.findUnique({ where: { id }, include: {
    balance: true, defaultClassification: true,
    demandLines: { include: { demand: true, vendor: true, projectTag: true, classification: true }, orderBy: { createdAt: "desc" }, take: 100 },
    purchaseLines: { include: { purchaseRequest: { include: { vendor: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
  } })
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 })
  const vendors = new Map<string, unknown>()
  for (const row of item.demandLines) if (row.vendor) vendors.set(row.vendor.id, row.vendor)
  for (const row of item.purchaseLines) if (row.purchaseRequest.vendor) vendors.set(row.purchaseRequest.vendor.id, row.purchaseRequest.vendor)
  return Response.json({ item, observedVendors: [...vendors.values()] })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await getSession(request)) return unauthorizedResponse()
  try {
    const { id } = await context.params
    const body = await request.json()
    const item = await db.item.update({ where: { id }, data: {
      code: body.code?.trim(), title: body.title?.trim(), discipline: body.discipline,
      description: body.description, function: body.function, link: body.link,
      optionSelection: body.optionSelection, remarks: body.remarks, unit: body.unit?.trim(),
      status: body.status, defaultClassificationId: body.defaultClassificationId,
    } })
    return Response.json({ item })
  } catch (error) { return apiError(error) }
}
