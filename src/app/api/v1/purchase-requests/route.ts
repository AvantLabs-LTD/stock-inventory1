import { NextRequest } from "next/server"
import { Prisma, ProcurementType } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError, normalizeName } from "@/lib/inventory-service"
import { createIncompleteItem } from "@/lib/item-service"
import { validateDemandCoverage } from "@/lib/purchase-service"

export async function GET(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse(); if (!hasPermission(session, "vault.purchasing.view")) return forbiddenResponse()
  const requests = await db.purchaseRequest.findMany({ include: {
    vendor: true, createdBy: { select: { id: true, name: true } },
    lines: { include: { item: { include: { category: true } }, demandLinks: { include: { demandLine: { include: { demand: { include: { departmentTag: true, requestedBy: { select: { name: true } } } }, projectTag: true } } } }, receiptLines: true } },
  }, orderBy: { createdAt: "desc" }, take: 200 })
  return Response.json({ requests })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.purchasing.manage")) return forbiddenResponse()
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
      for (const row of body.lines as Array<{ itemId?: string; type: ProcurementType; quantity: Prisma.Decimal.Value; remarks?: string; newItem?: Parameters<typeof createIncompleteItem>[1]; demandLinks?: Array<{ demandLineId: string; quantity: Prisma.Decimal.Value }> }>) {
        const quantity = new Prisma.Decimal(row.quantity)
        if (quantity.lte(0)) throw new DomainError("INVALID_QUANTITY", "Purchase quantities must be positive")
        if (!Object.values(ProcurementType).includes(row.type)) throw new DomainError("PROCUREMENT_TYPE_REQUIRED", "Choose a procurement type")
        const item = row.itemId
          ? await tx.item.findUnique({ where: { id: row.itemId } })
          : await createIncompleteItem(tx, row.newItem || {}, session.user.id)
        if (!item) throw new DomainError("ITEM_NOT_FOUND", "The selected component was not found", 404)
        const line = await tx.purchaseRequestLine.create({ data: { purchaseRequestId: header.id, itemId: item.id, type: row.type, quantity, remarks: row.remarks } })
        let linked = new Prisma.Decimal(0)
        for (const link of row.demandLinks || []) {
          const q = new Prisma.Decimal(link.quantity); linked = linked.plus(q)
          await validateDemandCoverage(tx, { demandLineId: link.demandLineId, itemId: item.id, quantity: q })
          await tx.demandPurchaseLink.create({ data: { purchaseRequestLineId: line.id, demandLineId: link.demandLineId, quantity: q } })
        }
        if (linked.gt(quantity)) throw new DomainError("OVER_LINKED_PURCHASE", "Linked demand quantity exceeds purchase quantity")
      }
      return tx.purchaseRequest.findUnique({ where: { id: header.id }, include: { vendor: true, lines: { include: { item: { include: { category: true } }, demandLinks: true } } } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return Response.json({ request: result }, { status: 201 })
  } catch (e) { return apiError(e) }
}
