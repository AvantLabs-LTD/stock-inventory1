import { NextRequest } from "next/server"
import { ItemDiscipline, ProcurementOrderStatus, RecordStatus } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"
import { getSession, hasPermission, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-middleware"
import { executeOrdersAction, listOrders, orderDetail, ordersActionPermission, ordersApiError } from "@/lib/orders-service"

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "orders.view")) return forbiddenResponse()
  try {
    const view = request.nextUrl.searchParams.get("view") || "orders"
    if (view === "capabilities") return Response.json({ version: 1, actions: Object.entries(ordersActionPermission).filter(([, permission]) => hasPermission(session, permission)).map(([action, permission]) => ({ action, permission })) })
    if (view === "detail") {
      const id = request.nextUrl.searchParams.get("id")
      if (!id) return Response.json({ code: "ID_REQUIRED", error: "Order ID required" }, { status: 400 })
      const order = await orderDetail(id)
      return order ? Response.json({ order }) : Response.json({ code: "NOT_FOUND", error: "Order not found" }, { status: 404 })
    }
    if (view === "references") {
      const vendors = await db.vendor.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, contactPerson: true, email: true, phone: true }, orderBy: { name: "asc" }, take: 500 })
      return Response.json({ vendors })
    }
    if (view === "items") {
      const q = request.nextUrl.searchParams.get("q")?.trim() || ""
      const discipline = z.nativeEnum(ItemDiscipline).optional().safeParse(request.nextUrl.searchParams.get("discipline") || undefined)
      if (!discipline.success) return Response.json({ code: "INVALID_FILTER", error: "Invalid component discipline" }, { status: 400 })
      if (q.length < 2) return Response.json({ items: [] })
      const items = await db.item.findMany({ where: { status: "ACTIVE", ...(discipline.data ? { discipline: discipline.data } : {}), OR: [{ code: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { manufacturerPartNumber: { contains: q, mode: "insensitive" } }] }, select: { id: true, code: true, title: true, specification: true, unit: true, discipline: true }, orderBy: [{ title: "asc" }, { code: "asc" }], take: 25 })
      return Response.json({ items })
    }
    if (view !== "orders") return Response.json({ code: "INVALID_VIEW", error: "Unknown Orders view" }, { status: 400 })
    const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50), q: z.string().trim().max(100).optional(), status: z.nativeEnum(ProcurementOrderStatus).optional(), source: z.string().trim().max(500).optional(), vendorId: z.string().trim().max(100).optional(), recordStatus: z.nativeEnum(RecordStatus).optional() }).safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()))
    if (!query.success) return Response.json({ code: "INVALID_FILTER", error: "Invalid Orders list filter" }, { status: 400 })
    return Response.json(await listOrders(query.data))
  } catch (error) { return ordersApiError(error) }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  try {
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || !("action" in body) || typeof body.action !== "string") return Response.json({ code: "ACTION_REQUIRED", error: "Orders action required" }, { status: 400 })
    const permission = ordersActionPermission[body.action]
    if (!permission) return Response.json({ code: "UNKNOWN_ACTION", error: "Unknown Orders action" }, { status: 404 })
    if (!hasPermission(session, permission)) return forbiddenResponse()
    const result = await executeOrdersAction(body.action, "data" in body ? body.data : {}, { id: session.user.id, name: session.user.name })
    return Response.json({ result })
  } catch (error) { return ordersApiError(error) }
}
