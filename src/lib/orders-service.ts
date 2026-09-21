import { Prisma, ProcurementOrderStatus, RecordStatus } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"

export class OrdersError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}

const id = z.string().trim().min(1).max(100)
const text = z.string().trim().min(1).max(500)
const optionalText = z.string().trim().max(4000).nullish().transform(value => value || null)
const optionalId = id.nullish().transform(value => value || null)
const amount = z.union([z.string().trim(), z.number().finite().transform(String)]).refine(value => /^\d+(?:\.\d{1,4})?$/.test(value), "Use a nonnegative amount with up to four decimal places").transform(value => new Prisma.Decimal(value))
const optionalAmount = amount.nullish().transform(value => value ?? null)
const quantity = z.union([z.string().trim(), z.number().finite().transform(String)]).refine(value => /^\d+(?:\.\d{1,3})?$/.test(value) && new Prisma.Decimal(value).gt(0), "Use a positive quantity with up to three decimal places").transform(value => new Prisma.Decimal(value))
const optionalDate = z.coerce.date().nullish().transform(value => value ?? null)
const currency = z.string().trim().regex(/^[A-Z]{3}$/, "Use a three-letter uppercase currency code")
type Actor = { id: string; name: string }
type Tx = Prisma.TransactionClient

async function audit(tx: Tx, actor: Actor, action: string, id: string, details: unknown) {
  await tx.auditLog.create({ data: { userId: actor.id, userName: actor.name, action, entityType: "ProcurementOrder", entityId: id, details: JSON.stringify(details) } })
}

export function ordersApiError(error: unknown) {
  if (error instanceof OrdersError) return Response.json({ code: error.code, error: error.message }, { status: error.status })
  if (error instanceof z.ZodError) return Response.json({ code: "INVALID_INPUT", error: error.issues.map(issue => issue.message).join("; ") }, { status: 400 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: "DUPLICATE_ORDER", error: "This source already has an order with that reference" }, { status: 409 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return Response.json({ code: "INVALID_REFERENCE", error: "A selected vendor or component no longer exists" }, { status: 400 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return Response.json({ code: "NOT_FOUND", error: "Order record not found" }, { status: 404 })
  console.error("Orders operation failed", error)
  return Response.json({ code: "INTERNAL_ERROR", error: "Orders operation failed" }, { status: 500 })
}

export const ordersActionPermission: Record<string, string> = {
  "order.create": "orders.manage", "order.update": "orders.manage", "order.archive": "orders.manage", "order.delete": "orders.manage",
  "line.create": "orders.manage", "line.update": "orders.manage", "line.remove": "orders.manage",
  "package-link.create": "orders.manage", "package-link.remove": "orders.manage",
}

const lineInput = z.object({ description: text, productUrl: z.string().trim().url().max(2000).nullish().transform(value => value || null), variant: optionalText, quantity, unitPrice: optionalAmount, notes: optionalText, itemId: optionalId })

export async function listOrders(options: { page: number; limit: number; q?: string; status?: ProcurementOrderStatus; source?: string; vendorId?: string; recordStatus?: RecordStatus }) {
  const where: Prisma.ProcurementOrderWhereInput = {
    statusRecord: options.recordStatus || "ACTIVE",
    ...(options.status ? { status: options.status } : {}),
    ...(options.source ? { source: { equals: options.source, mode: "insensitive" } } : {}),
    ...(options.vendorId ? { vendorId: options.vendorId } : {}),
    ...(options.q ? { OR: [{ orderNo: { contains: options.q, mode: "insensitive" } }, { supplierName: { contains: options.q, mode: "insensitive" } }, { trackingNumber: { contains: options.q, mode: "insensitive" } }] } : {}),
  }
  const [total, orders] = await Promise.all([
    db.procurementOrder.count({ where }),
    db.procurementOrder.findMany({ where, orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }], skip: (options.page - 1) * options.limit, take: options.limit, include: { vendor: { select: { id: true, name: true } }, _count: { select: { lines: true } } } }),
  ])
  return { orders, total, page: options.page, pageSize: options.limit, pageCount: Math.ceil(total / options.limit) }
}

export async function orderDetail(id: string) {
  return db.procurementOrder.findUnique({ where: { id }, include: { vendor: { select: { id: true, name: true, contactPerson: true, email: true, phone: true } }, lines: { orderBy: { lineNo: "asc" }, include: { item: { select: { id: true, code: true, title: true, description: true, specification: true, unit: true } } } }, packageLinks: { orderBy: { createdAt: "desc" }, include: { package: { select: { id: true, packageNo: true, status: true, shipment: { select: { id: true, shipmentNo: true } } } }, linkedBy: { select: { name: true } } } } } })
}

export async function executeOrdersAction(action: string, raw: unknown, actor: Actor) {
  return db.$transaction(async tx => {
    switch (action) {
      case "order.create": {
        const value = z.object({ source: text, orderNo: text, status: z.nativeEnum(ProcurementOrderStatus).default("DRAFT"), sourceStatus: optionalText, vendorId: optionalId, supplierName: text, submittedAt: optionalDate, currency, paidAmount: optionalAmount, shippingAmount: optionalAmount, courierName: optionalText, trackingNumber: optionalText, notes: optionalText, sourceFileName: optionalText, sourcePayload: z.unknown().nullish(), lines: z.array(lineInput).min(1).max(250) }).parse(raw)
        const row = await tx.procurementOrder.create({ data: { ...value, sourcePayload: value.sourcePayload ?? undefined, createdById: actor.id, lines: { create: value.lines.map((line, index) => ({ ...line, lineNo: index + 1 })) } }, include: { lines: true } })
        await audit(tx, actor, "ORDERS_ORDER_CREATE", row.id, { source: row.source, orderNo: row.orderNo, lineCount: row.lines.length })
        return row
      }
      case "order.update": {
        const value = z.object({ id, status: z.nativeEnum(ProcurementOrderStatus), sourceStatus: optionalText, vendorId: optionalId, supplierName: text, submittedAt: optionalDate, currency, paidAmount: optionalAmount, shippingAmount: optionalAmount, courierName: optionalText, trackingNumber: optionalText, notes: optionalText }).parse(raw)
        const row = await tx.procurementOrder.update({ where: { id: value.id }, data: value })
        await audit(tx, actor, "ORDERS_ORDER_UPDATE", row.id, value)
        return row
      }
      case "order.archive": {
        const value = z.object({ id, archived: z.boolean().default(true) }).parse(raw)
        const row = await tx.procurementOrder.update({ where: { id: value.id }, data: { statusRecord: value.archived ? "ARCHIVED" : "ACTIVE" } })
        await audit(tx, actor, value.archived ? "ORDERS_ORDER_ARCHIVE" : "ORDERS_ORDER_RESTORE", row.id, value)
        return row
      }
      case "order.delete": {
        const value = z.object({ id }).parse(raw)
        const row = await tx.procurementOrder.findUniqueOrThrow({ where: { id: value.id }, include: { _count: { select: { lines: true, packageLinks: true } } } })
        if (row.status !== "DRAFT") throw new OrdersError("ORDER_NOT_DRAFT", "Only draft orders can be permanently deleted; archive other orders instead", 409)
        if (row._count.packageLinks) throw new OrdersError("ORDER_HAS_PACKAGE_LINKS", "Remove linked cargo packages before permanently deleting this order", 409)
        await tx.procurementOrderLine.deleteMany({ where: { orderId: row.id } })
        await tx.procurementOrder.delete({ where: { id: row.id } })
        await audit(tx, actor, "ORDERS_ORDER_DELETE", row.id, { source: row.source, orderNo: row.orderNo, lineCount: row._count.lines })
        return { id: row.id }
      }
      case "line.create": {
        const value = z.object({ orderId: id, ...lineInput.shape }).parse(raw)
        const last = await tx.procurementOrderLine.aggregate({ where: { orderId: value.orderId }, _max: { lineNo: true } })
        const row = await tx.procurementOrderLine.create({ data: { ...value, lineNo: (last._max.lineNo || 0) + 1 } })
        await audit(tx, actor, "ORDERS_LINE_CREATE", value.orderId, { lineId: row.id, description: row.description })
        return row
      }
      case "line.update": {
        const value = z.object({ id, ...lineInput.shape }).parse(raw)
        const row = await tx.procurementOrderLine.update({ where: { id: value.id }, data: value })
        await audit(tx, actor, "ORDERS_LINE_UPDATE", row.orderId, { lineId: row.id, description: row.description })
        return row
      }
      case "line.remove": {
        const value = z.object({ id }).parse(raw)
        const row = await tx.procurementOrderLine.delete({ where: { id: value.id } })
        await audit(tx, actor, "ORDERS_LINE_REMOVE", row.orderId, { lineId: row.id, description: row.description })
        return { id: row.id, orderId: row.orderId }
      }
      case "package-link.create": {
        const value = z.object({ orderId: id, packageId: id, remarks: optionalText }).parse(raw)
        const [order, cargoPackage] = await Promise.all([tx.procurementOrder.findUnique({ where: { id: value.orderId }, select: { statusRecord: true } }), tx.cargoPackage.findUnique({ where: { id: value.packageId }, select: { status: true } })])
        if (!order) throw new OrdersError("ORDER_NOT_FOUND", "Order not found", 404)
        if (!cargoPackage) throw new OrdersError("PACKAGE_NOT_FOUND", "Cargo package not found", 404)
        if (order.statusRecord !== "ACTIVE" || cargoPackage.status !== "ACTIVE") throw new OrdersError("LINK_INACTIVE_RECORD", "Restore both the order and package before linking", 409)
        const row = await tx.procurementOrderPackage.create({ data: { ...value, linkedById: actor.id }, include: { package: { select: { id: true, packageNo: true, status: true, shipment: { select: { id: true, shipmentNo: true } } } }, linkedBy: { select: { name: true } } } })
        await audit(tx, actor, "ORDERS_PACKAGE_LINK_CREATE", value.orderId, { packageId: value.packageId, remarks: value.remarks })
        await tx.auditLog.create({ data: { userId: actor.id, userName: actor.name, action: "CARGO_ORDER_LINK_CREATE", entityType: "CargoPackage", entityId: value.packageId, details: JSON.stringify({ orderId: value.orderId, remarks: value.remarks }) } })
        return row
      }
      case "package-link.remove": {
        const value = z.object({ id }).parse(raw)
        const row = await tx.procurementOrderPackage.delete({ where: { id: value.id } })
        await audit(tx, actor, "ORDERS_PACKAGE_LINK_REMOVE", row.orderId, { packageId: row.packageId, remarks: row.remarks })
        await tx.auditLog.create({ data: { userId: actor.id, userName: actor.name, action: "CARGO_ORDER_LINK_REMOVE", entityType: "CargoPackage", entityId: row.packageId, details: JSON.stringify({ orderId: row.orderId, remarks: row.remarks }) } })
        return { id: row.id, orderId: row.orderId }
      }
      default: throw new OrdersError("UNKNOWN_ACTION", "Unknown Orders action", 404)
    }
  })
}
