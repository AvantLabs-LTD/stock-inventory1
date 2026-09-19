import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { cargoActionPermission, cargoApiError, cargoNameSuggestions, cargoReport, cargoShipmentDetail, executeCargoAction, listCargoPackages, listCargoShipments } from "@/lib/cargo-service"
import { z } from "zod"

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "cargo.view")) return forbiddenResponse()
  try {
    const view = request.nextUrl.searchParams.get("view") || "shipments"
    if (view === "suggestions") {
      const parsed = z.object({ kind: z.enum(["shipment", "package"]), q: z.string().trim().min(1).max(100) }).safeParse({ kind: request.nextUrl.searchParams.get("kind"), q: request.nextUrl.searchParams.get("q") })
      if (!parsed.success) return Response.json({ code: "INVALID_INPUT", error: "Suggestion kind and search prefix are required" }, { status: 400 })
      return Response.json({ suggestions: await cargoNameSuggestions(parsed.data.kind, parsed.data.q) })
    }
    if (view === "capabilities") return Response.json({ version: 1, actions: Object.entries(cargoActionPermission).filter(([, permission]) => hasPermission(session, permission)).map(([action, permission]) => ({ action, permission })), idempotencyKey: { header: "Idempotency-Key", minLength: 8, maxLength: 120 } })
    if (view === "shipments") {
      const parsed = z.coerce.number().int().min(1).max(100).safeParse(request.nextUrl.searchParams.get("limit") || 50)
      if (!parsed.success) return Response.json({ code: "INVALID_LIMIT", error: "Limit must be an integer from 1 to 100" }, { status: 400 })
      const cursor = request.nextUrl.searchParams.get("cursor") || undefined
      if (cursor && !(await db.cargoShipment.findUnique({ where: { id: cursor }, select: { id: true } }))) return Response.json({ code: "INVALID_CURSOR", error: "Cursor does not reference a shipment" }, { status: 400 })
      const filters = parseListFilters(request)
      if (filters instanceof Response) return filters
      return Response.json(await listCargoShipments({ limit: parsed.data, cursor, ...filters }))
    }
    if (view === "packages") {
      const parsed = z.coerce.number().int().min(1).max(100).safeParse(request.nextUrl.searchParams.get("limit") || 50)
      if (!parsed.success) return Response.json({ code: "INVALID_LIMIT", error: "Limit must be an integer from 1 to 100" }, { status: 400 })
      const cursor = request.nextUrl.searchParams.get("cursor") || undefined
      if (cursor && !(await db.cargoPackage.findUnique({ where: { id: cursor }, select: { id: true } }))) return Response.json({ code: "INVALID_CURSOR", error: "Cursor does not reference a package" }, { status: 400 })
      const filters = parseListFilters(request)
      if (filters instanceof Response) return filters
      return Response.json(await listCargoPackages({ limit: parsed.data, cursor, ...filters }))
    }
    if (view === "report") return Response.json({ report: await cargoReport(hasPermission(session, "cargo.costs.view")) })
    if (view === "shipment") {
      const id = request.nextUrl.searchParams.get("id")
      if (!id) return Response.json({ code: "ID_REQUIRED", error: "Shipment ID required" }, { status: 400 })
      const shipment = await cargoShipmentDetail(id, session.user.permissions)
      return shipment ? Response.json({ shipment }) : Response.json({ code: "NOT_FOUND", error: "Shipment not found" }, { status: 404 })
    }
    if (view === "package") {
      const id = request.nextUrl.searchParams.get("id")
      if (!id) return Response.json({ code: "ID_REQUIRED", error: "Package ID required" }, { status: 400 })
      const cargoPackage = await db.cargoPackage.findUnique({ where: { id }, select: { shipmentId: true } })
      if (!cargoPackage) return Response.json({ code: "NOT_FOUND", error: "Package not found" }, { status: 404 })
      const shipment = await cargoShipmentDetail(cargoPackage.shipmentId, session.user.permissions)
      return Response.json({ shipment, packageId: id })
    }
    if (view === "references") {
      const [forwarders, couriers, vendors, immatureShipments] = await Promise.all([
        db.cargoForwarder.findMany({ include: { warehouses: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } }),
        db.cargoCourier.findMany({ orderBy: { name: "asc" } }),
        db.vendor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        db.cargoShipment.findMany({ where: { status: "ACTIVE", trackingLegs: { none: {} }, milestones: { none: { sequence: { gt: 0 } } } }, select: { id: true, shipmentNo: true }, orderBy: { createdAt: "desc" }, take: 100 }),
      ])
      return Response.json({ forwarders, couriers, vendors, immatureShipments })
    }
    return Response.json({ code: "INVALID_VIEW", error: "Unknown Cargo view" }, { status: 400 })
  } catch (error) { return cargoApiError(error) }
}

function parseListFilters(request: NextRequest) {
  const parsed = z.object({
    page: z.coerce.number().int().min(1).optional(),
    q: z.string().trim().max(100).optional(),
    stage: z.enum(["NEEDS_REVIEW", "AT_VENDOR", "TO_SOURCE_WAREHOUSE", "AT_SOURCE_WAREHOUSE", "IN_INTERNATIONAL_TRANSIT", "ARRIVED_IN_COUNTRY", "CUSTOMS_PENDING", "CUSTOMS_CLEARED", "OUT_FOR_DELIVERY", "RECEIVED"]).optional(),
    route: z.enum(["DIRECT", "FORWARDED"]).optional(),
    forwarderId: z.string().trim().min(1).max(100).optional(),
    sourceWarehouseId: z.string().trim().min(1).max(100).optional(),
    vendorId: z.string().trim().min(1).max(100).optional(),
    status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  }).safeParse(Object.fromEntries(["page", "q", "stage", "route", "forwarderId", "sourceWarehouseId", "vendorId", "status"].flatMap(key => { const value = request.nextUrl.searchParams.get(key); return value ? [[key, value]] : [] })))
  return parsed.success ? parsed.data : Response.json({ code: "INVALID_FILTER", error: "Invalid Cargo list filter" }, { status: 400 })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  try {
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || !("action" in body) || typeof body.action !== "string") return Response.json({ code: "ACTION_REQUIRED", error: "Cargo action required" }, { status: 400 })
    const permission = cargoActionPermission[body.action]
    if (!permission) return Response.json({ code: "UNKNOWN_ACTION", error: "Unknown Cargo action" }, { status: 404 })
    if (!hasPermission(session, permission)) return forbiddenResponse()
    const result = await executeCargoAction(body.action, "data" in body ? body.data : {}, { id: session.user.id, name: session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name }, request.headers.get("idempotency-key") || undefined)
    return Response.json({ result })
  } catch (error) { return cargoApiError(error) }
}
