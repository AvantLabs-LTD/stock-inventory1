import { randomUUID } from "node:crypto"
import { CargoChargeCategory, CargoLegKind, CargoRoute, CargoStage, Prisma, RecordStatus } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"

export class CargoError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}

export function cargoApiError(error: unknown) {
  if (error instanceof CargoError) return Response.json({ code: error.code, error: error.message }, { status: error.status })
  if (error instanceof z.ZodError) return Response.json({ code: "INVALID_INPUT", error: error.issues.map(i => i.message).join("; ") }, { status: 400 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: "CONFLICT", error: "A record with this identifier already exists" }, { status: 409 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return Response.json({ code: "INVALID_REFERENCE", error: "Related record not found or belongs to another shipment" }, { status: 400 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return Response.json({ code: "NOT_FOUND", error: "Cargo record not found" }, { status: 404 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return Response.json({ code: "CONFLICT", error: "Concurrent Cargo update; retry" }, { status: 409 })
  console.error("Cargo operation failed", error)
  return Response.json({ code: "INTERNAL_ERROR", error: "Cargo operation failed" }, { status: 500 })
}

const id = z.string().trim().min(1).max(100)
const text = z.string().trim().min(1).max(500)
const optionalText = z.string().trim().max(4000).nullish().transform(v => v || null)
const optionalId = id.nullish().transform(v => v || null)
const positive = z.coerce.number().finite().positive()
const nonnegative = z.coerce.number().finite().min(0)
const optionalPositive = z.coerce.number().finite().positive().nullish().transform(v => v ?? null)
const currency = z.string().trim().regex(/^[A-Z]{3}$/, "Use a three-letter uppercase currency code")
const date = z.coerce.date()
const optionalDate = z.coerce.date().nullish().transform(v => v ?? null)
type Tx = Prisma.TransactionClient
type Actor = { id: string; name: string }

async function audit(tx: Tx, actor: Actor, action: string, type: string, entityId: string, details: unknown) {
  await tx.auditLog.create({ data: { userId: actor.id, userName: actor.name, action, entityType: type, entityId, details: JSON.stringify(details) } })
}

async function sourceWarehouse(tx: Tx, forwarderId: string | null, selectedId: string | null) {
  if (!forwarderId) return null
  const warehouses = await tx.cargoSourceWarehouse.findMany({ where: { forwarderId, status: "ACTIVE" }, select: { id: true } })
  if (selectedId) {
    if (!warehouses.some(row => row.id === selectedId)) throw new CargoError("WAREHOUSE_MISMATCH", "Choose an active source warehouse of the selected forwarder")
    return selectedId
  }
  if (warehouses.length === 1) return warehouses[0].id
  throw new CargoError("WAREHOUSE_REQUIRED", warehouses.length ? "Choose a source warehouse" : "Add an active source warehouse for this forwarder")
}

function number(prefix: string) { return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}` }

export const cargoActionPermission: Record<string, string> = {
  "reference.create": "cargo.reference.manage", "reference.update": "cargo.reference.manage",
  "shipment.create": "cargo.shipments.manage", "shipment.update": "cargo.shipments.manage",
  "package.create": "cargo.packages.manage", "package.update": "cargo.packages.manage", "package.reassign": "cargo.packages.manage",
  "item.save": "cargo.packages.manage", "item.remove": "cargo.packages.manage",
  "milestone.post": "cargo.milestones.post", "tracking.save": "cargo.tracking.manage",
  "invoice.save": "cargo.costs.manage", "charge.save": "cargo.costs.manage",
}

const nextStage: Record<CargoStage, CargoStage[]> = {
  AT_VENDOR: [CargoStage.TO_SOURCE_WAREHOUSE, CargoStage.IN_INTERNATIONAL_TRANSIT],
  TO_SOURCE_WAREHOUSE: [CargoStage.AT_SOURCE_WAREHOUSE],
  AT_SOURCE_WAREHOUSE: [CargoStage.IN_INTERNATIONAL_TRANSIT],
  IN_INTERNATIONAL_TRANSIT: [CargoStage.ARRIVED_IN_COUNTRY],
  ARRIVED_IN_COUNTRY: [CargoStage.CUSTOMS_PENDING],
  CUSTOMS_PENDING: [CargoStage.CUSTOMS_CLEARED],
  CUSTOMS_CLEARED: [CargoStage.OUT_FOR_DELIVERY],
  OUT_FOR_DELIVERY: [CargoStage.RECEIVED],
  RECEIVED: [],
}

export async function executeCargoAction(action: string, raw: unknown, actor: Actor) {
  if (!(action in cargoActionPermission)) throw new CargoError("UNKNOWN_ACTION", "Unknown Cargo action", 404)
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(async tx => {
    switch (action) {
      case "reference.create": {
        const v = z.object({ kind: z.enum(["forwarder", "warehouse", "courier"]), name: text, forwarderId: optionalId, code: optionalText, address: optionalText, notes: optionalText }).parse(raw)
        const base = { name: v.name, normalizedName: v.name.toLocaleLowerCase().replace(/\s+/g, " ").trim(), notes: v.notes }
        if (v.kind === "warehouse") {
          if (!v.forwarderId) throw new CargoError("FORWARDER_REQUIRED", "Choose a forwarder")
          const row = await tx.cargoSourceWarehouse.create({ data: { ...base, forwarderId: v.forwarderId, address: v.address } })
          await audit(tx, actor, "CARGO_REFERENCE_CREATE", "CargoSourceWarehouse", row.id, v)
          return row
        }
        if (v.kind === "forwarder") {
          const row = await tx.cargoForwarder.create({ data: base })
          await audit(tx, actor, "CARGO_REFERENCE_CREATE", "CargoForwarder", row.id, v)
          return row
        }
        const row = await tx.cargoCourier.create({ data: { ...base, code: v.code } })
        await audit(tx, actor, "CARGO_REFERENCE_CREATE", "CargoCourier", row.id, v)
        return row
      }
      case "reference.update": {
        const v = z.object({ kind: z.enum(["forwarder", "warehouse", "courier"]), id, name: text, status: z.nativeEnum(RecordStatus), notes: optionalText }).parse(raw)
        const data = { name: v.name, normalizedName: v.name.toLocaleLowerCase().replace(/\s+/g, " ").trim(), status: v.status, notes: v.notes }
        const row = v.kind === "warehouse" ? await tx.cargoSourceWarehouse.update({ where: { id: v.id }, data }) : v.kind === "forwarder" ? await tx.cargoForwarder.update({ where: { id: v.id }, data }) : await tx.cargoCourier.update({ where: { id: v.id }, data })
        await audit(tx, actor, "CARGO_REFERENCE_UPDATE", v.kind, row.id, v)
        return row
      }
      case "shipment.create": {
        const v = z.object({ route: z.nativeEnum(CargoRoute), forwarderId: optionalId, sourceWarehouseId: optionalId, notes: optionalText }).parse(raw)
        if (v.route === "DIRECT" && (v.forwarderId || v.sourceWarehouseId)) throw new CargoError("INVALID_ROUTE", "Direct courier route cannot use a source warehouse")
        if (v.route === "FORWARDED" && !v.forwarderId) throw new CargoError("FORWARDER_REQUIRED", "Choose a forwarder")
        const warehouseId = await sourceWarehouse(tx, v.forwarderId, v.sourceWarehouseId)
        const row = await tx.cargoShipment.create({ data: { shipmentNo: number("CS"), route: v.route, forwarderId: v.forwarderId, sourceWarehouseId: warehouseId, notes: v.notes, createdById: actor.id, milestones: { create: { sequence: 0, stage: CargoStage.AT_VENDOR, occurredAt: new Date(), postedById: actor.id } } }, include: { milestones: true } })
        await audit(tx, actor, "CARGO_SHIPMENT_CREATE", "CargoShipment", row.id, v)
        return row
      }
      case "shipment.update": {
        const v = z.object({ id, notes: optionalText, forwarderId: optionalId, sourceWarehouseId: optionalId }).parse(raw)
        const old = await tx.cargoShipment.findUniqueOrThrow({ where: { id: v.id }, include: { milestones: true, trackingLegs: true } })
        if (old.milestones.length > 1 || old.trackingLegs.length) throw new CargoError("JOURNEY_LOCKED", "Route and source warehouse are locked after journey or tracking starts")
        if (old.route === "DIRECT" && (v.forwarderId || v.sourceWarehouseId)) throw new CargoError("INVALID_ROUTE", "Direct courier route cannot use a source warehouse")
        if (old.route === "FORWARDED" && !v.forwarderId) throw new CargoError("FORWARDER_REQUIRED", "Choose a forwarder")
        const warehouseId = await sourceWarehouse(tx, v.forwarderId, v.sourceWarehouseId)
        const row = await tx.cargoShipment.update({ where: { id: v.id }, data: { notes: v.notes, forwarderId: v.forwarderId, sourceWarehouseId: warehouseId } })
        await audit(tx, actor, "CARGO_SHIPMENT_UPDATE", "CargoShipment", row.id, { before: old, after: v })
        return row
      }
      case "package.create": {
        const v = z.object({ shipmentId: optionalId, route: z.nativeEnum(CargoRoute).optional(), forwarderId: optionalId, sourceWarehouseId: optionalId, vendorId: optionalId, weight: optionalPositive, verifiedWeight: optionalPositive, length: optionalPositive, width: optionalPositive, height: optionalPositive, notes: optionalText }).parse(raw)
        let shipmentId = v.shipmentId
        if (!shipmentId) {
          if (!v.route) throw new CargoError("ROUTE_REQUIRED", "Choose a route")
          if (v.route === "DIRECT" && (v.forwarderId || v.sourceWarehouseId)) throw new CargoError("INVALID_ROUTE", "Direct courier route cannot use a source warehouse")
          if (v.route === "FORWARDED" && !v.forwarderId) throw new CargoError("FORWARDER_REQUIRED", "Choose a forwarder")
          const warehouseId = await sourceWarehouse(tx, v.forwarderId, v.sourceWarehouseId)
          const shipment = await tx.cargoShipment.create({ data: { shipmentNo: number("CS"), route: v.route, forwarderId: v.forwarderId, sourceWarehouseId: warehouseId, createdById: actor.id, milestones: { create: { sequence: 0, stage: CargoStage.AT_VENDOR, occurredAt: new Date(), postedById: actor.id } } } })
          shipmentId = shipment.id
        } else {
          const shipment = await tx.cargoShipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { milestones: true, trackingLegs: true } })
          if (shipment.milestones.length > 1 || shipment.trackingLegs.length) throw new CargoError("JOURNEY_LOCKED", "New cartons can only join an immature shipment")
        }
        const row = await tx.cargoPackage.create({ data: { packageNo: number("CP"), shipmentId, vendorId: v.vendorId, weight: v.weight, verifiedWeight: v.verifiedWeight, length: v.length, width: v.width, height: v.height, notes: v.notes } })
        await audit(tx, actor, "CARGO_PACKAGE_CREATE", "CargoPackage", row.id, v)
        return row
      }
      case "package.update": {
        const v = z.object({ id, vendorId: optionalId, weight: optionalPositive, verifiedWeight: optionalPositive, length: optionalPositive, width: optionalPositive, height: optionalPositive, notes: optionalText }).parse(raw)
        const old = await tx.cargoPackage.findUniqueOrThrow({ where: { id: v.id } })
        const row = await tx.cargoPackage.update({ where: { id: v.id }, data: { vendorId: v.vendorId, weight: v.weight, verifiedWeight: v.verifiedWeight, length: v.length, width: v.width, height: v.height, notes: v.notes } })
        await audit(tx, actor, "CARGO_PACKAGE_UPDATE", "CargoPackage", row.id, { before: old, after: v })
        return row
      }
      case "package.reassign": {
        const v = z.object({ id, shipmentId: id }).parse(raw)
        const row = await tx.cargoPackage.findUniqueOrThrow({ where: { id: v.id }, include: { invoices: true, charges: true, files: true } })
        if (row.shipmentId === v.shipmentId) return row
        const shipments = await tx.cargoShipment.findMany({ where: { id: { in: [row.shipmentId, v.shipmentId] } }, include: { milestones: true, trackingLegs: true, _count: { select: { packages: true, invoices: true, charges: true, files: true } } } })
        if (shipments.length !== 2) throw new CargoError("SHIPMENT_NOT_FOUND", "Destination shipment not found", 404)
        if (shipments.some(s => s.milestones.length > 1 || s.trackingLegs.length)) throw new CargoError("JOURNEY_LOCKED", "Package reassignment locks after first journey or tracking update", 409)
        const source = shipments.find(s => s.id === row.shipmentId)!
        if (source._count.packages === 1 && (source._count.invoices || source._count.charges || source._count.files)) throw new CargoError("SHIPMENT_HAS_HISTORY", "The only carton cannot leave a shipment with financial or document history", 409)
        if (row.invoices.length || row.charges.length || row.files.length) throw new CargoError("PACKAGE_HAS_HISTORY", "Package-linked financial or document history prevents reassignment", 409)
        const updated = await tx.cargoPackage.update({ where: { id: row.id }, data: { shipmentId: v.shipmentId } })
        await audit(tx, actor, "CARGO_PACKAGE_REASSIGN", "CargoPackage", row.id, { from: row.shipmentId, to: v.shipmentId })
        return updated
      }
      case "item.save": {
        const v = z.object({ id: optionalId, packageId: id, description: text, quantity: positive, notes: optionalText, sortOrder: z.coerce.number().int().min(0).default(0) }).parse(raw)
        const old = v.id ? await tx.cargoPackageItem.findUniqueOrThrow({ where: { id: v.id } }) : null
        if (old && old.packageId !== v.packageId) throw new CargoError("PACKAGE_MISMATCH", "Packing item belongs to another package")
        const row = old ? await tx.cargoPackageItem.update({ where: { id: old.id }, data: { description: v.description, quantity: v.quantity, notes: v.notes, sortOrder: v.sortOrder } }) : await tx.cargoPackageItem.create({ data: { packageId: v.packageId, description: v.description, quantity: v.quantity, notes: v.notes, sortOrder: v.sortOrder } })
        await audit(tx, actor, "CARGO_PACKING_ITEM_SAVE", "CargoPackageItem", row.id, { before: old, after: v })
        return row
      }
      case "item.remove": {
        const v = z.object({ id }).parse(raw)
        const old = await tx.cargoPackageItem.findUniqueOrThrow({ where: { id: v.id } })
        await tx.cargoPackageItem.delete({ where: { id: v.id } })
        await audit(tx, actor, "CARGO_PACKING_ITEM_REMOVE", "CargoPackageItem", v.id, old)
        return { id: v.id }
      }
      case "milestone.post": {
        const v = z.object({ shipmentId: id, stage: z.nativeEnum(CargoStage), occurredAt: date, location: optionalText, remarks: optionalText }).parse(raw)
        const shipment = await tx.cargoShipment.findUniqueOrThrow({ where: { id: v.shipmentId }, include: { milestones: { orderBy: { sequence: "desc" }, take: 1 } } })
        const previous = shipment.milestones[0]
        if (!previous || !nextStage[previous.stage].includes(v.stage)) throw new CargoError("INVALID_STAGE", "Invalid Cargo journey transition", 409)
        if (shipment.route === "DIRECT" && v.stage === "TO_SOURCE_WAREHOUSE") throw new CargoError("INVALID_ROUTE", "Direct route bypasses source warehouse")
        if (shipment.route === "FORWARDED" && previous.stage === "AT_VENDOR" && v.stage !== "TO_SOURCE_WAREHOUSE") throw new CargoError("INVALID_ROUTE", "Forwarded route first travels to source warehouse")
        if (v.occurredAt < previous.occurredAt) throw new CargoError("INVALID_DATE", "Journey date cannot precede the previous milestone")
        const row = await tx.cargoMilestone.create({ data: { shipmentId: v.shipmentId, sequence: previous.sequence + 1, stage: v.stage, occurredAt: v.occurredAt, location: v.location, remarks: v.remarks, postedById: actor.id } })
        await audit(tx, actor, "CARGO_MILESTONE_POST", "CargoMilestone", row.id, v)
        return row
      }
      case "tracking.save": {
        const v = z.object({ id: optionalId, shipmentId: id, kind: z.nativeEnum(CargoLegKind), courierId: optionalId, trackingNumber: optionalText, dispatchedAt: optionalDate, arrivedAt: optionalDate, remarks: optionalText }).parse(raw)
        if (v.dispatchedAt && v.arrivedAt && v.arrivedAt < v.dispatchedAt) throw new CargoError("INVALID_DATE", "Arrival precedes dispatch")
        const old = v.id ? await tx.cargoTrackingLeg.findUniqueOrThrow({ where: { id: v.id } }) : null
        if (old && old.shipmentId !== v.shipmentId) throw new CargoError("SHIPMENT_MISMATCH", "Tracking leg belongs to another shipment")
        if (!old && v.kind === "SOURCE_INLAND") {
          const shipment = await tx.cargoShipment.findUniqueOrThrow({ where: { id: v.shipmentId } })
          if (shipment.route === "DIRECT") throw new CargoError("INVALID_ROUTE", "Direct route has no source inland leg")
        }
        const sequence = old ? old.sequence : (await tx.cargoTrackingLeg.aggregate({ where: { shipmentId: v.shipmentId }, _max: { sequence: true } }))._max.sequence ?? -1
        const data = { kind: v.kind, courierId: v.courierId, trackingNumber: v.trackingNumber, dispatchedAt: v.dispatchedAt, arrivedAt: v.arrivedAt, remarks: v.remarks }
        const row = old ? await tx.cargoTrackingLeg.update({ where: { id: old.id }, data }) : await tx.cargoTrackingLeg.create({ data: { ...data, shipmentId: v.shipmentId, sequence: sequence + 1 } })
        await audit(tx, actor, "CARGO_TRACKING_SAVE", "CargoTrackingLeg", row.id, { before: old, after: v })
        return row
      }
      case "invoice.save": {
        const v = z.object({ id: optionalId, shipmentId: id, packageId: optionalId, trackingLegId: optionalId, invoiceNo: optionalText, sourceName: optionalText, invoiceDate: optionalDate, totalAmount: nonnegative.nullish().transform(x => x ?? null), currency, notes: optionalText }).parse(raw)
        const old = v.id ? await tx.cargoInvoice.findUniqueOrThrow({ where: { id: v.id } }) : null
        if (old && old.shipmentId !== v.shipmentId) throw new CargoError("SHIPMENT_MISMATCH", "Invoice belongs to another shipment")
        const data = { packageId: v.packageId, trackingLegId: v.trackingLegId, invoiceNo: v.invoiceNo, sourceName: v.sourceName, invoiceDate: v.invoiceDate, totalAmount: v.totalAmount, currency: v.currency, notes: v.notes }
        const row = old ? await tx.cargoInvoice.update({ where: { id: old.id }, data }) : await tx.cargoInvoice.create({ data: { ...data, shipmentId: v.shipmentId, createdById: actor.id } })
        await audit(tx, actor, "CARGO_INVOICE_SAVE", "CargoInvoice", row.id, { before: old, after: v })
        return row
      }
      case "charge.save": {
        const v = z.object({ id: optionalId, shipmentId: id, packageId: optionalId, trackingLegId: optionalId, invoiceId: optionalId, category: z.nativeEnum(CargoChargeCategory), amount: positive, currency, pkrEquivalent: nonnegative.nullish().transform(x => x ?? null), pkrNote: optionalText, remarks: optionalText }).parse(raw)
        if (v.pkrEquivalent !== null && !v.pkrNote) throw new CargoError("PKR_NOTE_REQUIRED", "Explain the manual PKR comparison")
        const old = v.id ? await tx.cargoCharge.findUniqueOrThrow({ where: { id: v.id } }) : null
        if (old && old.shipmentId !== v.shipmentId) throw new CargoError("SHIPMENT_MISMATCH", "Charge belongs to another shipment")
        const data = { packageId: v.packageId, trackingLegId: v.trackingLegId, invoiceId: v.invoiceId, category: v.category, amount: v.amount, currency: v.currency, pkrEquivalent: v.pkrEquivalent, pkrNote: v.pkrNote, remarks: v.remarks }
        const row = old ? await tx.cargoCharge.update({ where: { id: old.id }, data }) : await tx.cargoCharge.create({ data: { ...data, shipmentId: v.shipmentId, createdById: actor.id } })
        await audit(tx, actor, "CARGO_CHARGE_SAVE", "CargoCharge", row.id, { before: old, after: v })
        return row
      }
    }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue
      throw error
    }
  }
  throw new CargoError("CONFLICT", "Concurrent Cargo update; retry", 409)
}

export async function listCargoShipments(limit = 50, cursor?: string) {
  const rows = await db.cargoShipment.findMany({ take: Math.min(Math.max(limit, 1), 100), ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "desc" }, select: { id: true, shipmentNo: true, route: true, notes: true, createdAt: true, forwarder: { select: { name: true } }, sourceWarehouse: { select: { name: true } }, _count: { select: { packages: true } }, milestones: { orderBy: { sequence: "desc" }, take: 1, select: { stage: true, occurredAt: true } } } })
  return rows.map(row => ({ ...row, stage: row.milestones[0]?.stage ?? "AT_VENDOR", milestones: undefined }))
}

export async function cargoShipmentDetail(id: string, permissions: string[]) {
  const costs = permissions.includes("cargo.costs.view")
  const docs = permissions.includes("cargo.documents.view")
  return db.cargoShipment.findUnique({ where: { id }, include: {
    forwarder: true, sourceWarehouse: true, createdBy: { select: { name: true } },
    packages: { include: { vendor: { select: { id: true, name: true } }, items: { orderBy: { sortOrder: "asc" } } }, orderBy: { packageNo: "asc" } },
    milestones: { orderBy: { sequence: "asc" } }, trackingLegs: { include: { courier: { select: { name: true } } }, orderBy: { sequence: "asc" } },
    invoices: costs ? { orderBy: { createdAt: "asc" } } : false,
    charges: costs ? { orderBy: { createdAt: "asc" } } : false,
    files: docs ? { select: { id: true, packageId: true, invoiceId: true, kind: true, fileName: true, contentType: true, sizeBytes: true, sha256: true, createdAt: true }, orderBy: { createdAt: "asc" } } : false,
  } })
}

export async function cargoReport(includeCosts: boolean) {
  const [shipments, packages, stages, routes, charges] = await Promise.all([
    db.cargoShipment.count(),
    db.cargoPackage.count(),
    db.$queryRaw<Array<{ stage: string; count: number }>>(Prisma.sql`
      SELECT latest.stage::text AS stage, COUNT(*)::int AS count
      FROM cargo_shipments AS shipment
      JOIN LATERAL (
        SELECT milestone.stage FROM cargo_milestones AS milestone
        WHERE milestone."shipmentId" = shipment.id
        ORDER BY milestone.sequence DESC LIMIT 1
      ) AS latest ON TRUE
      GROUP BY latest.stage
    `),
    db.cargoShipment.groupBy({ by: ["route"], _count: { id: true } }),
    includeCosts ? db.cargoCharge.groupBy({ by: ["category", "currency"], _sum: { amount: true }, _count: { id: true } }) : Promise.resolve([]),
  ])
  return { shipments, packages, stages, routes: routes.map(row => ({ route: row.route, count: row._count.id })), charges: charges.map(row => ({ category: row.category, currency: row.currency, amount: row._sum.amount?.toString() || "0", count: row._count.id })) }
}
