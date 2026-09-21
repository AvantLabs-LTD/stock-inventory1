import { NextRequest } from "next/server"
import { Prisma, ProcurementType } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError, normalizeName } from "@/lib/inventory-service"
import { createIncompleteItem } from "@/lib/item-service"
import { validateDemandCoverage } from "@/lib/purchase-service"

export async function GET(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse(); if (!hasPermission(session, "vault.purchasing.view")) return forbiddenResponse()
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize")) || 50))
  const status = request.nextUrl.searchParams.get("status") || "ACTIVE"
  const q = request.nextUrl.searchParams.get("q")?.trim()
  const where: Prisma.PurchaseRequestWhereInput = {
    ...(status === "ACTIVE" ? { status: { not: "RECEIVED_IN_STORE" } } : status === "ALL" ? {} : { status: status as never }),
    ...(q ? { OR: [
      { requestNo: { contains: q, mode: "insensitive" } }, { vendor: { name: { contains: q, mode: "insensitive" } } },
      { lines: { some: { item: { OR: [{ code: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } } } },
      { lines: { some: { demandLinks: { some: { demandLine: { demand: { demandNo: { contains: q, mode: "insensitive" } } } } } } } },
    ] } : {}),
  }
  const [requests, total] = await Promise.all([db.purchaseRequest.findMany({ where, select: {
    id: true, requestNo: true, status: true, createdAt: true, updatedAt: true, submittedAt: true, orderedAt: true, shippedAt: true, receivedAt: true,
    trackingNumber: true, boxNumber: true, shippingDetails: true, remarks: true,
    vendor: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } },
    lines: { select: {
      id: true, quantity: true, type: true, remarks: true,
      item: { select: { id: true, code: true, title: true, specification: true, unit: true } },
      demandLinks: { select: { id: true, quantity: true, demandLine: { select: {
        id: true, title: true, unit: true, projectTag: { select: { id: true, name: true } },
        demand: { select: { id: true, demandNo: true, state: true, departmentTag: { select: { id: true, name: true } }, requestedBy: { select: { name: true } } } },
      } } } },
    } },
  }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), db.purchaseRequest.count({ where })])
  return Response.json({ requests, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } })
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
