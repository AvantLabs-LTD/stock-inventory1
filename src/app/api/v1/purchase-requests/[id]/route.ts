import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError, normalizeName } from "@/lib/inventory-service"

const detailInclude = {
  vendor: true,
  createdBy: { select: { id: true, name: true } },
  lines: { include: {
    item: { include: { category: true } },
    demandLinks: { include: { demandLine: { include: { demand: { include: { departmentTag: true, requestedBy: { select: { name: true } } } }, projectTag: true } } } },
    receiptLines: { include: { receipt: { select: { id: true, receiptNo: true, postedAt: true } } } },
  }, orderBy: { createdAt: "asc" as const } },
  receipts: { include: { lines: true }, orderBy: { postedAt: "desc" as const } },
} as const

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await getSession(request)) return unauthorizedResponse()
  const { id } = await context.params
  const purchase = await db.purchaseRequest.findUnique({ where: { id }, include: detailInclude })
  if (!purchase) return Response.json({ error: "Purchase request not found" }, { status: 404 })
  const itemIds = purchase.lines.map(line => line.itemId)
  const eligibleDemands = itemIds.length ? await db.$queryRaw<Array<{ itemId: string; demandLineId: string; demandNo: string; destination: string | null; approvedForProcurement: Prisma.Decimal; remaining: Prisma.Decimal; linkedToCurrentPurchase: boolean }>>(Prisma.sql`
    SELECT q."itemId",q."demandLineId",d."demandNo",COALESCE(pt.name,dt.name) destination,
      q."approvedForProcurement",q.remaining,
      EXISTS (
        SELECT 1 FROM "demand_purchase_links" link
        JOIN "purchase_request_lines" pl ON pl.id=link."purchaseRequestLineId"
        WHERE link."demandLineId"=q."demandLineId" AND pl."purchaseRequestId"=${id}
      ) "linkedToCurrentPurchase"
    FROM "demand_line_quantities" q
    JOIN "demand_lines" dl ON dl.id=q."demandLineId"
    JOIN "demands" d ON d.id=q."demandId"
    LEFT JOIN "project_tags" pt ON pt.id=dl."projectTagId"
    LEFT JOIN "department_tags" dt ON dt.id=d."departmentTagId"
    WHERE q."itemId" IN (${Prisma.join(itemIds)}) AND q."approvedForProcurement">0 AND q.remaining>0
    ORDER BY "linkedToCurrentPurchase" DESC,d."requestedAt",dl."sortOrder"
  `) : []
  return Response.json({ request: { ...purchase, lines: purchase.lines.map(line => ({
    ...line,
    eligibleDemands: eligibleDemands.filter(demand => demand.itemId === line.itemId),
  })) } })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const body = await request.json()
    const purchase = await db.$transaction(async tx => {
      const current = await tx.purchaseRequest.findUnique({ where: { id }, include: { lines: { include: { demandLinks: true, receiptLines: true } } } })
      if (!current) throw new DomainError("PURCHASE_NOT_FOUND", "Purchase request not found", 404)
      if (current.status === "RECEIVED_IN_STORE") throw new DomainError("PURCHASE_NOT_EDITABLE", "A fully received purchase cannot be edited")
      let vendorId = current.vendorId
      if (typeof body.vendorName === "string") {
        const name = body.vendorName.trim()
        vendorId = name ? (await tx.vendor.upsert({ where: { normalizedName: normalizeName(name) }, update: {}, create: { name, normalizedName: normalizeName(name) } })).id : null
      }
      if (body.lineUpdates?.length) {
        if (current.status !== "BACKLOG") throw new DomainError("PURCHASE_NOT_EDITABLE", "Purchase quantities can only be changed while in backlog")
        for (const update of body.lineUpdates as Array<{ id: string; quantity: Prisma.Decimal.Value; remarks?: string | null }>) {
          const line = current.lines.find(row => row.id === update.id)
          if (!line) throw new DomainError("PURCHASE_LINE_NOT_FOUND", "Purchase line not found", 404)
          const quantity = new Prisma.Decimal(update.quantity)
          const linked = line.demandLinks.reduce((sum, row) => sum.plus(row.quantity), new Prisma.Decimal(0))
          const received = line.receiptLines.reduce((sum, row) => sum.plus(row.quantity), new Prisma.Decimal(0))
          if (quantity.lte(0) || quantity.lt(linked) || quantity.lt(received)) throw new DomainError("INVALID_PURCHASE_QUANTITY", "Purchase quantity must be positive and cannot be below linked or received quantity")
          await tx.purchaseRequestLine.update({ where: { id: line.id }, data: { quantity, remarks: update.remarks === undefined ? undefined : update.remarks?.trim() || null } })
        }
      }
      await tx.purchaseRequest.update({ where: { id }, data: {
        vendorId,
        remarks: body.remarks === undefined ? undefined : body.remarks?.trim() || null,
        trackingNumber: body.trackingNumber === undefined ? undefined : body.trackingNumber?.trim() || null,
        boxNumber: body.boxNumber === undefined ? undefined : body.boxNumber?.trim() || null,
        shippingDetails: body.shippingDetails === undefined ? undefined : body.shippingDetails?.trim() || null,
      } })
      return tx.purchaseRequest.findUnique({ where: { id }, include: detailInclude })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return Response.json({ request: purchase })
  } catch (error) { return apiError(error) }
}
