import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"
export async function PATCH(request: NextRequest, context: { params: Promise<{ lineId: string }> }) {
  if (!await getSession(request)) return unauthorizedResponse()
  try {
    const { lineId } = await context.params; const body = await request.json()
    const existing = await db.demandLine.findUnique({ where: { id: lineId }, include: { reservations: true, allocationLines: true } })
    if (!existing) throw new DomainError("DEMAND_LINE_NOT_FOUND", "Demand row not found", 404)
    if ((body.itemId !== undefined || body.requiredQuantity !== undefined) && (existing.reservations.length || existing.allocationLines.length)) {
      throw new DomainError("ROW_ALREADY_COMMITTED", "Item and required quantity cannot change after stock is reserved or allocated")
    }
    const item = body.itemId ? await db.item.findUnique({ where: { id: body.itemId } }) : null
    const line = await db.demandLine.update({ where: { id: lineId }, data: {
      itemId: body.itemId, itemCodeSnapshot: item?.code, title: body.title || item?.title,
      description: body.description === undefined ? item?.description : body.description,
      unit: body.unit || item?.unit, projectTagId: body.projectTagId,
      classificationId: body.classificationId || item?.defaultClassificationId,
      vendorId: body.vendorId, requiredQuantity: body.requiredQuantity, remarks: body.remarks,
    } })
    return Response.json({ line })
  } catch (e) { return apiError(e) }
}
