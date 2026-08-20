import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError, normalizeName } from "@/lib/inventory-service"

export async function GET(request: NextRequest) {
  if (!await getSession(request)) return unauthorizedResponse()
  const requests = await db.purchaseRequest.findMany({ include: {
    vendor: true, createdBy: { select: { id: true, name: true } },
    lines: { include: { item: true, classification: true, demandLinks: { include: { demandLine: { include: { demand: { select: { demandNo: true } } } } } }, receiptLines: true } },
  }, orderBy: { createdAt: "desc" }, take: 200 })
  return Response.json({ requests })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  try {
    const body = await request.json()
    if (!body.lines?.length) throw new DomainError("PURCHASE_LINES_REQUIRED", "At least one purchase row is required")
    const result = await db.$transaction(async tx => {
      let vendorId = body.vendorId || null
      if (!vendorId && body.vendorName?.trim()) {
        const name = body.vendorName.trim()
        vendorId = (await tx.vendor.upsert({ where: { normalizedName: normalizeName(name) }, update: {}, create: { name, normalizedName: normalizeName(name) } })).id
      }
      const header = await tx.purchaseRequest.create({ data: {
        requestNo: "PUR-" + Date.now() + "-" + Math.floor(Math.random()*1000),
        vendorId, createdById: session.user.id, remarks: body.remarks,
        trackingNumber: body.trackingNumber, boxNumber: body.boxNumber, shippingDetails: body.shippingDetails,
      } })
      for (const row of body.lines as Array<{ itemId: string; classificationId: string; quantity: Prisma.Decimal.Value; remarks?: string; demandLinks?: Array<{ demandLineId: string; quantity: Prisma.Decimal.Value }> }>) {
        const quantity = new Prisma.Decimal(row.quantity)
        if (quantity.lte(0)) throw new DomainError("INVALID_QUANTITY", "Purchase quantities must be positive")
        const line = await tx.purchaseRequestLine.create({ data: { purchaseRequestId: header.id, itemId: row.itemId, classificationId: row.classificationId, quantity, remarks: row.remarks } })
        let linked = new Prisma.Decimal(0)
        for (const link of row.demandLinks || []) {
          const q = new Prisma.Decimal(link.quantity); linked = linked.plus(q)
          const demandLine = await tx.demandLine.findUnique({ where: { id: link.demandLineId } })
          if (!demandLine || demandLine.itemId !== row.itemId || q.lte(0)) throw new DomainError("INVALID_DEMAND_LINK", "Purchase link must target a demand row for the same item")
          await tx.demandPurchaseLink.create({ data: { purchaseRequestLineId: line.id, demandLineId: link.demandLineId, quantity: q } })
        }
        if (linked.gt(quantity)) throw new DomainError("OVER_LINKED_PURCHASE", "Linked demand quantity exceeds purchase quantity")
      }
      return tx.purchaseRequest.findUnique({ where: { id: header.id }, include: { vendor: true, lines: { include: { item: true, classification: true, demandLinks: true } } } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return Response.json({ request: result }, { status: 201 })
  } catch (e) { return apiError(e) }
}
