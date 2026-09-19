import { createHash, randomUUID } from "node:crypto"
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
const optionalIdentifier = z.string().trim().min(1).max(100).nullish().transform(v => v || null)
function decimal(scale: number, integerDigits: number, allowZero = false) {
  const input = z.union([z.string().trim(), z.number().finite().transform(String)])
  return input.refine(value => {
    if (!/^\d+(?:\.\d+)?$/.test(value)) return false
    const [integer, fraction = ""] = value.split(".")
    if (integer.replace(/^0+/, "").length > integerDigits || fraction.length > scale) return false
    return allowZero || new Prisma.Decimal(value).gt(0)
  }, { message: `Use a ${allowZero ? "nonnegative" : "positive"} decimal with at most ${scale} decimal places` }).transform(value => new Prisma.Decimal(value))
}
const quantity = decimal(3, 15)
const weight = decimal(3, 9).nullish().transform(value => value ?? null)
const dimension = decimal(2, 10).nullish().transform(value => value ?? null)
const moneyPositive = decimal(4, 14)
const moneyNonnegative = decimal(4, 14, true).nullish().transform(value => value ?? null)
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

async function uniqueCargoNumber(tx: Tx, kind: "shipment" | "package", requested: string | null, currentId?: string) {
  const value = requested || number(kind === "shipment" ? "CS" : "CP")
  const duplicate = kind === "shipment"
    ? await tx.cargoShipment.findFirst({ where: { shipmentNo: { equals: value, mode: "insensitive" }, ...(currentId ? { id: { not: currentId } } : {}) }, select: { id: true } })
    : await tx.cargoPackage.findFirst({ where: { packageNo: { equals: value, mode: "insensitive" }, ...(currentId ? { id: { not: currentId } } : {}) }, select: { id: true } })
  if (duplicate) throw new CargoError("DUPLICATE_IDENTIFIER", `A ${kind} named “${value}” already exists`, 409)
  return value
}

export const cargoActionPermission: Record<string, string> = {
  "reference.create": "cargo.reference.manage", "reference.update": "cargo.reference.manage",
  "shipment.create": "cargo.shipments.manage", "shipment.update": "cargo.shipments.manage", "shipment.merge": "cargo.shipments.manage", "shipment.archive": "cargo.shipments.manage", "shipment.delete": "cargo.shipments.manage",
  "package.create": "cargo.packages.manage", "package.update": "cargo.packages.manage", "package.reassign": "cargo.packages.manage", "package.archive": "cargo.packages.manage", "package.delete": "cargo.packages.manage",
  "item.save": "cargo.packages.manage", "item.remove": "cargo.packages.manage",
  "milestone.post": "cargo.milestones.post", "tracking.save": "cargo.tracking.manage", "tracking.delete": "cargo.tracking.manage",
  "invoice.save": "cargo.costs.manage", "invoice.delete": "cargo.costs.manage", "charge.save": "cargo.costs.manage", "charge.delete": "cargo.costs.manage",
  "file.delete": "cargo.documents.manage",
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

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]))
  return value
}

async function performCargoAction(tx: Tx, action: string, raw: unknown, actor: Actor) {
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
        const v = z.object({ shipmentNo: optionalIdentifier, route: z.nativeEnum(CargoRoute), forwarderId: optionalId, sourceWarehouseId: optionalId, notes: optionalText }).parse(raw)
        if (v.route === "DIRECT" && (v.forwarderId || v.sourceWarehouseId)) throw new CargoError("INVALID_ROUTE", "Direct courier route cannot use a source warehouse")
        if (v.route === "FORWARDED" && !v.forwarderId) throw new CargoError("FORWARDER_REQUIRED", "Choose a forwarder")
        const warehouseId = await sourceWarehouse(tx, v.forwarderId, v.sourceWarehouseId)
        const shipmentNo = await uniqueCargoNumber(tx, "shipment", v.shipmentNo)
        const row = await tx.cargoShipment.create({ data: { shipmentNo, route: v.route, forwarderId: v.forwarderId, sourceWarehouseId: warehouseId, notes: v.notes, createdById: actor.id, milestones: { create: { sequence: 0, stage: CargoStage.AT_VENDOR, occurredAt: new Date(), postedById: actor.id } } }, include: { milestones: true } })
        await audit(tx, actor, "CARGO_SHIPMENT_CREATE", "CargoShipment", row.id, v)
        return row
      }
      case "shipment.update": {
        const v = z.object({ id, shipmentNo: optionalIdentifier, notes: optionalText, forwarderId: optionalId, sourceWarehouseId: optionalId }).parse(raw)
        const old = await tx.cargoShipment.findUniqueOrThrow({ where: { id: v.id }, include: { milestones: true, trackingLegs: true } })
        const journeyLocked = old.milestones.length > 1 || old.trackingLegs.length > 0
        if (journeyLocked && (v.forwarderId !== old.forwarderId || v.sourceWarehouseId !== old.sourceWarehouseId)) throw new CargoError("JOURNEY_LOCKED", "Route and source warehouse are locked after journey or tracking starts")
        if (old.route === "DIRECT" && (v.forwarderId || v.sourceWarehouseId)) throw new CargoError("INVALID_ROUTE", "Direct courier route cannot use a source warehouse")
        if (old.route === "FORWARDED" && !v.forwarderId) throw new CargoError("FORWARDER_REQUIRED", "Choose a forwarder")
        const warehouseId = journeyLocked ? old.sourceWarehouseId : await sourceWarehouse(tx, v.forwarderId, v.sourceWarehouseId)
        const shipmentNo = await uniqueCargoNumber(tx, "shipment", v.shipmentNo || old.shipmentNo, v.id)
        const row = await tx.cargoShipment.update({ where: { id: v.id }, data: { shipmentNo, notes: v.notes, forwarderId: v.forwarderId, sourceWarehouseId: warehouseId } })
        await audit(tx, actor, "CARGO_SHIPMENT_UPDATE", "CargoShipment", row.id, { before: old, after: v })
        return row
      }
      case "shipment.merge": {
        const v = z.object({ targetShipmentId: id, sourceShipmentIds: z.array(id).min(1).max(99), trackingNumber: z.string().trim().min(1).max(200) }).parse(raw)
        const sourceShipmentIds = [...new Set(v.sourceShipmentIds)]
        if (sourceShipmentIds.length !== v.sourceShipmentIds.length) throw new CargoError("DUPLICATE_SOURCE", "Each source shipment may only be listed once")
        if (sourceShipmentIds.includes(v.targetShipmentId)) throw new CargoError("INVALID_MERGE", "The target shipment cannot also be a source shipment")
        const shipmentIds = [v.targetShipmentId, ...sourceShipmentIds]
        const shipments = await tx.cargoShipment.findMany({
          where: { id: { in: shipmentIds } },
          include: {
            packages: { select: { id: true, packageNo: true } },
            milestones: { orderBy: { sequence: "asc" } },
            trackingLegs: { orderBy: { sequence: "asc" } },
          },
        })
        if (shipments.length !== shipmentIds.length) throw new CargoError("SHIPMENT_NOT_FOUND", "One or more merge shipments were not found", 404)
        if (shipments.some(shipment => shipment.status !== "ACTIVE")) throw new CargoError("SHIPMENT_ARCHIVED", "Restore every shipment before merging", 409)
        const target = shipments.find(shipment => shipment.id === v.targetShipmentId)!
        const expectedTracking = v.trackingNumber.trim().toLocaleLowerCase()
        const sameJourneyContext = shipments.every(shipment => shipment.route === target.route && shipment.forwarderId === target.forwarderId && shipment.sourceWarehouseId === target.sourceWarehouseId && shipment.milestones.at(-1)?.stage === target.milestones.at(-1)?.stage)
        if (!sameJourneyContext) throw new CargoError("INCOMPATIBLE_SHIPMENTS", "Merged shipments must have the same route, forwarder, warehouse, and current journey stage", 409)
        if (shipments.some(shipment => shipment.packages.length === 0)) throw new CargoError("EMPTY_SHIPMENT", "Every merged shipment must contain at least one package", 409)
        const matchingLeg = (shipment: typeof target) => shipment.trackingLegs.filter(leg => leg.trackingNumber?.trim().toLocaleLowerCase() === expectedTracking)
        if (shipments.some(shipment => matchingLeg(shipment).length !== 1 || shipment.trackingLegs.length !== 1)) throw new CargoError("TRACKING_MISMATCH", "Every merged shipment must have exactly one tracking leg matching the confirmed tracking number", 409)
        const targetLeg = matchingLeg(target)[0]
        const sourceTrackingIds = shipments.filter(shipment => shipment.id !== target.id).flatMap(shipment => shipment.trackingLegs.map(leg => leg.id))
        const packages = shipments.filter(shipment => shipment.id !== target.id).flatMap(shipment => shipment.packages)
        const packageIds = packages.map(row => row.id)
        const [invoices, charges, files, legacyEvents] = await Promise.all([
          tx.cargoInvoice.findMany({ where: { shipmentId: { in: sourceShipmentIds } } }),
          tx.cargoCharge.findMany({ where: { shipmentId: { in: sourceShipmentIds } } }),
          tx.cargoFile.findMany({ where: { shipmentId: { in: sourceShipmentIds } } }),
          tx.cargoLegacyEvent.findMany({ where: { shipmentId: { in: sourceShipmentIds } } }),
        ])

        // Composite ownership keys keep package, invoice, leg, file, and charge links
        // within one shipment. Detach optional links while their owners move, then
        // restore them against the canonical target inside this serializable transaction.
        await tx.cargoCharge.updateMany({ where: { shipmentId: { in: sourceShipmentIds } }, data: { packageId: null, trackingLegId: null, invoiceId: null } })
        await tx.cargoInvoice.updateMany({ where: { shipmentId: { in: sourceShipmentIds } }, data: { packageId: null, trackingLegId: null } })
        // Package photos have a database constraint requiring packageId. Recreate
        // the immutable rows with their original IDs after their packages move;
        // doing this in the same transaction preserves atomic rollback.
        await tx.cargoFile.deleteMany({ where: { shipmentId: { in: sourceShipmentIds } } })
        await tx.cargoLegacyEvent.deleteMany({ where: { shipmentId: { in: sourceShipmentIds } } })
        await tx.cargoPackage.updateMany({ where: { id: { in: packageIds } }, data: { shipmentId: target.id } })
        await tx.cargoInvoice.updateMany({ where: { shipmentId: { in: sourceShipmentIds } }, data: { shipmentId: target.id } })
        await tx.cargoCharge.updateMany({ where: { shipmentId: { in: sourceShipmentIds } }, data: { shipmentId: target.id } })

        for (const invoice of invoices) await tx.cargoInvoice.update({ where: { id: invoice.id }, data: { packageId: invoice.packageId, trackingLegId: invoice.trackingLegId ? targetLeg.id : null } })
        for (const charge of charges) await tx.cargoCharge.update({ where: { id: charge.id }, data: { packageId: charge.packageId, trackingLegId: charge.trackingLegId ? targetLeg.id : null, invoiceId: charge.invoiceId } })
        if (files.length) await tx.cargoFile.createMany({ data: files.map(file => ({ ...file, shipmentId: target.id })) })
        if (legacyEvents.length) await tx.cargoLegacyEvent.createMany({ data: legacyEvents.map(event => ({ ...event, shipmentId: target.id })) })

        await tx.cargoTrackingLeg.deleteMany({ where: { id: { in: sourceTrackingIds } } })
        await tx.cargoMilestone.deleteMany({ where: { shipmentId: { in: sourceShipmentIds } } })
        await tx.cargoShipment.deleteMany({ where: { id: { in: sourceShipmentIds } } })
        const packageCount = await tx.cargoPackage.count({ where: { shipmentId: target.id } })
        await audit(tx, actor, "CARGO_SHIPMENT_MERGE", "CargoShipment", target.id, {
          trackingNumber: v.trackingNumber.trim(),
          targetShipment: { id: target.id, shipmentNo: target.shipmentNo },
          mergedShipments: shipments.filter(shipment => shipment.id !== target.id).map(shipment => ({ id: shipment.id, shipmentNo: shipment.shipmentNo, packages: shipment.packages.map(row => row.packageNo), milestone: shipment.milestones.at(-1)?.stage })),
        })
        return { id: target.id, shipmentNo: target.shipmentNo, trackingNumber: v.trackingNumber.trim(), packageCount, mergedShipmentIds: sourceShipmentIds }
      }
      case "package.create": {
        const v = z.object({ packageNo: optionalIdentifier, shipmentNo: optionalIdentifier, shipmentId: optionalId, route: z.nativeEnum(CargoRoute).optional(), forwarderId: optionalId, sourceWarehouseId: optionalId, vendorId: optionalId, weight, verifiedWeight: weight, length: dimension, width: dimension, height: dimension, notes: optionalText }).parse(raw)
        let shipmentId = v.shipmentId
        if (!shipmentId) {
          if (!v.route) throw new CargoError("ROUTE_REQUIRED", "Choose a route")
          if (v.route === "DIRECT" && (v.forwarderId || v.sourceWarehouseId)) throw new CargoError("INVALID_ROUTE", "Direct courier route cannot use a source warehouse")
          if (v.route === "FORWARDED" && !v.forwarderId) throw new CargoError("FORWARDER_REQUIRED", "Choose a forwarder")
          const warehouseId = await sourceWarehouse(tx, v.forwarderId, v.sourceWarehouseId)
          const shipmentNo = await uniqueCargoNumber(tx, "shipment", v.shipmentNo)
          const shipment = await tx.cargoShipment.create({ data: { shipmentNo, route: v.route, forwarderId: v.forwarderId, sourceWarehouseId: warehouseId, createdById: actor.id, milestones: { create: { sequence: 0, stage: CargoStage.AT_VENDOR, occurredAt: new Date(), postedById: actor.id } } } })
          shipmentId = shipment.id
        } else {
          const shipment = await tx.cargoShipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { milestones: true, trackingLegs: true } })
          if (shipment.status !== "ACTIVE") throw new CargoError("SHIPMENT_ARCHIVED", "Restore the shipment before adding packages", 409)
          if (shipment.milestones.length > 1 || shipment.trackingLegs.length) throw new CargoError("JOURNEY_LOCKED", "New cartons can only join an immature shipment")
        }
        const packageNo = await uniqueCargoNumber(tx, "package", v.packageNo)
        const row = await tx.cargoPackage.create({ data: { packageNo, shipmentId, vendorId: v.vendorId, weight: v.weight, verifiedWeight: v.verifiedWeight, length: v.length, width: v.width, height: v.height, notes: v.notes } })
        await audit(tx, actor, "CARGO_PACKAGE_CREATE", "CargoPackage", row.id, v)
        return row
      }
      case "package.update": {
        const v = z.object({ id, packageNo: optionalIdentifier, vendorId: optionalId, weight, verifiedWeight: weight, length: dimension, width: dimension, height: dimension, notes: optionalText }).parse(raw)
        const old = await tx.cargoPackage.findUniqueOrThrow({ where: { id: v.id } })
        const packageNo = await uniqueCargoNumber(tx, "package", v.packageNo || old.packageNo, v.id)
        const row = await tx.cargoPackage.update({ where: { id: v.id }, data: { packageNo, vendorId: v.vendorId, weight: v.weight, verifiedWeight: v.verifiedWeight, length: v.length, width: v.width, height: v.height, notes: v.notes } })
        await audit(tx, actor, "CARGO_PACKAGE_UPDATE", "CargoPackage", row.id, { before: old, after: v })
        return row
      }
      case "shipment.archive": {
        const v = z.object({ id, archived: z.boolean().default(true) }).parse(raw)
        const row = await tx.cargoShipment.update({ where: { id: v.id }, data: { status: v.archived ? "ARCHIVED" : "ACTIVE" } })
        await audit(tx, actor, v.archived ? "CARGO_SHIPMENT_ARCHIVE" : "CARGO_SHIPMENT_RESTORE", "CargoShipment", row.id, v)
        return row
      }
      case "shipment.delete": {
        const v = z.object({ id }).parse(raw)
        const row = await tx.cargoShipment.findUniqueOrThrow({ where: { id: v.id }, include: { milestones: true, _count: { select: { packages: true, trackingLegs: true, invoices: true, charges: true, files: true, legacyEvents: true } } } })
        const hasHistory = row._count.packages || row._count.trackingLegs || row._count.invoices || row._count.charges || row._count.files || row._count.legacyEvents || row.milestones.length > 1
        if (hasHistory) throw new CargoError("SHIPMENT_HAS_HISTORY", "Archive this shipment because it already has packages or operational history", 409)
        await tx.cargoMilestone.deleteMany({ where: { shipmentId: row.id } })
        await tx.cargoShipment.delete({ where: { id: row.id } })
        await audit(tx, actor, "CARGO_SHIPMENT_DELETE", "CargoShipment", row.id, { shipmentNo: row.shipmentNo })
        return { id: row.id }
      }
      case "package.archive": {
        const v = z.object({ id, archived: z.boolean().default(true) }).parse(raw)
        const row = await tx.cargoPackage.update({ where: { id: v.id }, data: { status: v.archived ? "ARCHIVED" : "ACTIVE" } })
        await audit(tx, actor, v.archived ? "CARGO_PACKAGE_ARCHIVE" : "CARGO_PACKAGE_RESTORE", "CargoPackage", row.id, v)
        return row
      }
      case "package.delete": {
        const v = z.object({ id }).parse(raw)
        const row = await tx.cargoPackage.findUniqueOrThrow({ where: { id: v.id }, include: { _count: { select: { items: true, invoices: true, charges: true, files: true, legacyEvents: true } } } })
        if (row._count.items || row._count.invoices || row._count.charges || row._count.files || row._count.legacyEvents) throw new CargoError("PACKAGE_HAS_HISTORY", "Archive this package because it already has contents, documents, costs, or imported history", 409)
        await tx.cargoPackage.delete({ where: { id: row.id } })
        await audit(tx, actor, "CARGO_PACKAGE_DELETE", "CargoPackage", row.id, { packageNo: row.packageNo })
        return { id: row.id, shipmentId: row.shipmentId }
      }
      case "package.reassign": {
        const v = z.object({ id, shipmentId: id }).parse(raw)
        const row = await tx.cargoPackage.findUniqueOrThrow({ where: { id: v.id }, include: { invoices: true, charges: true, files: true } })
        if (row.shipmentId === v.shipmentId) return row
        const shipments = await tx.cargoShipment.findMany({ where: { id: { in: [row.shipmentId, v.shipmentId] } }, include: { milestones: true, trackingLegs: true, _count: { select: { packages: true, invoices: true, charges: true, files: true } } } })
        if (shipments.length !== 2) throw new CargoError("SHIPMENT_NOT_FOUND", "Destination shipment not found", 404)
        if (shipments.some(s => s.status !== "ACTIVE")) throw new CargoError("SHIPMENT_ARCHIVED", "Restore both shipments before reassigning a package", 409)
        if (shipments.some(s => s.milestones.length > 1 || s.trackingLegs.length)) throw new CargoError("JOURNEY_LOCKED", "Package reassignment locks after first journey or tracking update", 409)
        const source = shipments.find(s => s.id === row.shipmentId)!
        if (source._count.packages === 1 && (source._count.invoices || source._count.charges || source._count.files)) throw new CargoError("SHIPMENT_HAS_HISTORY", "The only carton cannot leave a shipment with financial or document history", 409)
        if (row.invoices.length || row.charges.length || row.files.length) throw new CargoError("PACKAGE_HAS_HISTORY", "Package-linked financial or document history prevents reassignment", 409)
        const updated = await tx.cargoPackage.update({ where: { id: row.id }, data: { shipmentId: v.shipmentId } })
        await audit(tx, actor, "CARGO_PACKAGE_REASSIGN", "CargoPackage", row.id, { from: row.shipmentId, to: v.shipmentId })
        return updated
      }
      case "item.save": {
        const v = z.object({ id: optionalId, packageId: id, description: text, quantity, notes: optionalText, sortOrder: z.coerce.number().int().min(0).default(0) }).parse(raw)
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
        if (previous && !nextStage[previous.stage].includes(v.stage)) throw new CargoError("INVALID_STAGE", "Invalid Cargo journey transition", 409)
        if (shipment.route === "DIRECT" && ["TO_SOURCE_WAREHOUSE", "AT_SOURCE_WAREHOUSE"].includes(v.stage)) throw new CargoError("INVALID_ROUTE", "Direct route bypasses source warehouse")
        if (shipment.route === "FORWARDED" && previous?.stage === "AT_VENDOR" && v.stage !== "TO_SOURCE_WAREHOUSE") throw new CargoError("INVALID_ROUTE", "Forwarded route first travels to source warehouse")
        if (previous && v.occurredAt < previous.occurredAt) throw new CargoError("INVALID_DATE", "Journey date cannot precede the previous milestone")
        const row = await tx.cargoMilestone.create({ data: { shipmentId: v.shipmentId, sequence: previous ? previous.sequence + 1 : 0, stage: v.stage, occurredAt: v.occurredAt, location: v.location, remarks: v.remarks, postedById: actor.id } })
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
      case "tracking.delete": {
        const v = z.object({ id }).parse(raw)
        const old = await tx.cargoTrackingLeg.findUniqueOrThrow({ where: { id: v.id }, include: { _count: { select: { invoices: true, charges: true } } } })
        if (old._count.invoices || old._count.charges) throw new CargoError("TRACKING_HAS_HISTORY", "Remove or relink its invoices and charges before deleting this tracking leg", 409)
        await tx.cargoTrackingLeg.delete({ where: { id: old.id } })
        await audit(tx, actor, "CARGO_TRACKING_DELETE", "CargoTrackingLeg", old.id, old)
        return { id: old.id, shipmentId: old.shipmentId }
      }
      case "invoice.save": {
        const v = z.object({ id: optionalId, shipmentId: id, packageId: optionalId, trackingLegId: optionalId, invoiceNo: optionalText, sourceName: optionalText, invoiceDate: optionalDate, totalAmount: moneyNonnegative, currency, notes: optionalText }).parse(raw)
        const old = v.id ? await tx.cargoInvoice.findUniqueOrThrow({ where: { id: v.id } }) : null
        if (old && old.shipmentId !== v.shipmentId) throw new CargoError("SHIPMENT_MISMATCH", "Invoice belongs to another shipment")
        const data = { packageId: v.packageId, trackingLegId: v.trackingLegId, invoiceNo: v.invoiceNo, sourceName: v.sourceName, invoiceDate: v.invoiceDate, totalAmount: v.totalAmount, currency: v.currency, notes: v.notes }
        const row = old ? await tx.cargoInvoice.update({ where: { id: old.id }, data }) : await tx.cargoInvoice.create({ data: { ...data, shipmentId: v.shipmentId, createdById: actor.id } })
        await audit(tx, actor, "CARGO_INVOICE_SAVE", "CargoInvoice", row.id, { before: old, after: v })
        return row
      }
      case "invoice.delete": {
        const v = z.object({ id }).parse(raw)
        const old = await tx.cargoInvoice.findUniqueOrThrow({ where: { id: v.id }, include: { _count: { select: { charges: true, files: true } } } })
        if (old._count.charges || old._count.files) throw new CargoError("INVOICE_HAS_HISTORY", "Remove or relink its charges and files before deleting this invoice", 409)
        await tx.cargoInvoice.delete({ where: { id: old.id } })
        await audit(tx, actor, "CARGO_INVOICE_DELETE", "CargoInvoice", old.id, old)
        return { id: old.id, shipmentId: old.shipmentId }
      }
      case "charge.save": {
        const v = z.object({ id: optionalId, shipmentId: id, packageId: optionalId, trackingLegId: optionalId, invoiceId: optionalId, category: z.nativeEnum(CargoChargeCategory), amount: moneyPositive, currency, pkrEquivalent: moneyNonnegative, pkrNote: optionalText, remarks: optionalText }).parse(raw)
        if (v.pkrEquivalent !== null && !v.pkrNote) throw new CargoError("PKR_NOTE_REQUIRED", "Explain the manual PKR comparison")
        const old = v.id ? await tx.cargoCharge.findUniqueOrThrow({ where: { id: v.id } }) : null
        if (old && old.shipmentId !== v.shipmentId) throw new CargoError("SHIPMENT_MISMATCH", "Charge belongs to another shipment")
        const data = { packageId: v.packageId, trackingLegId: v.trackingLegId, invoiceId: v.invoiceId, category: v.category, amount: v.amount, currency: v.currency, pkrEquivalent: v.pkrEquivalent, pkrNote: v.pkrNote, remarks: v.remarks }
        const row = old ? await tx.cargoCharge.update({ where: { id: old.id }, data }) : await tx.cargoCharge.create({ data: { ...data, shipmentId: v.shipmentId, createdById: actor.id } })
        await audit(tx, actor, "CARGO_CHARGE_SAVE", "CargoCharge", row.id, { before: old, after: v })
        return row
      }
      case "charge.delete": {
        const v = z.object({ id }).parse(raw)
        const old = await tx.cargoCharge.findUniqueOrThrow({ where: { id: v.id } })
        await tx.cargoCharge.delete({ where: { id: old.id } })
        await audit(tx, actor, "CARGO_CHARGE_DELETE", "CargoCharge", old.id, old)
        return { id: old.id, shipmentId: old.shipmentId }
      }
      case "file.delete": {
        const v = z.object({ id }).parse(raw)
        const old = await tx.cargoFile.findUniqueOrThrow({ where: { id: v.id }, select: { id: true, shipmentId: true, packageId: true, invoiceId: true, kind: true, fileName: true, sha256: true } })
        await tx.cargoFile.delete({ where: { id: old.id } })
        await audit(tx, actor, "CARGO_FILE_DELETE", "CargoFile", old.id, old)
        return { id: old.id, shipmentId: old.shipmentId }
      }
      default: throw new CargoError("UNKNOWN_ACTION", "Unknown Cargo action", 404)
    }
}

export async function executeCargoAction(action: string, raw: unknown, actor: Actor, idempotencyKey?: string) {
  if (!(action in cargoActionPermission)) throw new CargoError("UNKNOWN_ACTION", "Unknown Cargo action", 404)
  const key = idempotencyKey?.trim()
  if (key && !/^[A-Za-z0-9._:-]{8,120}$/.test(key)) throw new CargoError("INVALID_IDEMPOTENCY_KEY", "Use an 8–120 character idempotency key")
  const requestHash = createHash("sha256").update(JSON.stringify(canonical({ action, data: raw }))).digest("hex")
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(async tx => {
      if (key) {
        const previous = await tx.cargoRequestKey.findUnique({ where: { actorId_key: { actorId: actor.id, key } } })
        if (previous) {
          if (previous.requestHash !== requestHash) throw new CargoError("IDEMPOTENCY_KEY_CONFLICT", "This key was used for different Cargo input", 409)
          if (previous.response === null) throw new CargoError("IDEMPOTENCY_IN_PROGRESS", "Request is still being committed; retry shortly", 409)
          return previous.response as { id: string }
        }
        await tx.cargoRequestKey.create({ data: { actorId: actor.id, key, action, requestHash } })
      }
      const result = await performCargoAction(tx, action, raw, actor)
      if (key) await tx.cargoRequestKey.update({ where: { actorId_key: { actorId: actor.id, key } }, data: { response: JSON.parse(JSON.stringify(result)) } })
      return result
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue
      if (key && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const previous = await db.cargoRequestKey.findUnique({ where: { actorId_key: { actorId: actor.id, key } } })
        if (previous) {
          if (previous.requestHash !== requestHash) throw new CargoError("IDEMPOTENCY_KEY_CONFLICT", "This key was used for different Cargo input", 409)
          if (previous.response !== null) return previous.response as { id: string }
        }
      }
      throw error
    }
  }
  throw new CargoError("CONFLICT", "Concurrent Cargo update; retry", 409)
}

type CargoListOptions = { limit?: number; page?: number; cursor?: string; q?: string; stage?: CargoStage | "NEEDS_REVIEW"; route?: CargoRoute; forwarderId?: string; sourceWarehouseId?: string; vendorId?: string; status?: RecordStatus }

async function shipmentIdsAtStage(stage?: CargoStage | "NEEDS_REVIEW") {
  if (!stage) return undefined
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT shipment.id
    FROM cargo_shipments AS shipment
    LEFT JOIN LATERAL (
      SELECT milestone.stage::text AS stage
      FROM cargo_milestones AS milestone
      WHERE milestone."shipmentId" = shipment.id
      ORDER BY milestone.sequence DESC LIMIT 1
    ) AS latest ON TRUE
    WHERE COALESCE(latest.stage, 'NEEDS_REVIEW') = ${stage}
  `)
  return rows.map(row => row.id)
}

export async function listCargoShipments(options: CargoListOptions = {}) {
  const limit = options.limit ?? 50
  const pageNumber = options.page ?? 1
  const stageIds = await shipmentIdsAtStage(options.stage)
  const where: Prisma.CargoShipmentWhereInput = {
    status: options.status ?? "ACTIVE",
    ...(options.q ? { OR: [{ shipmentNo: { contains: options.q, mode: "insensitive" } }, { notes: { contains: options.q, mode: "insensitive" } }] } : {}),
    ...(options.route ? { route: options.route } : {}),
    ...(options.forwarderId ? { forwarderId: options.forwarderId } : {}),
    ...(options.sourceWarehouseId ? { sourceWarehouseId: options.sourceWarehouseId } : {}),
    ...(options.vendorId ? { packages: { some: { vendorId: options.vendorId } } } : {}),
    ...(stageIds ? { id: { in: stageIds } } : {}),
  }
  const [rows, total] = await Promise.all([
    db.cargoShipment.findMany({ take: limit + (options.cursor ? 1 : 0), skip: options.cursor ? 1 : (pageNumber - 1) * limit, ...(options.cursor ? { cursor: { id: options.cursor } } : {}), where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, shipmentNo: true, route: true, status: true, notes: true, createdAt: true, forwarder: { select: { id: true, name: true } }, sourceWarehouse: { select: { id: true, name: true } }, _count: { select: { packages: true } }, milestones: { orderBy: { sequence: "desc" }, take: 1, select: { stage: true, occurredAt: true } } } }),
    db.cargoShipment.count({ where }),
  ])
  const result = options.cursor ? rows.slice(0, limit) : rows
  return { shipments: result.map(row => ({ ...row, stage: row.milestones[0]?.stage ?? "NEEDS_REVIEW", milestones: undefined })), total, page: pageNumber, pageSize: limit, pageCount: Math.ceil(total / limit), nextCursor: options.cursor && rows.length > limit ? result.at(-1)?.id ?? null : null }
}

export async function listCargoPackages(options: CargoListOptions = {}) {
  const limit = options.limit ?? 50
  const pageNumber = options.page ?? 1
  const stageIds = await shipmentIdsAtStage(options.stage)
  const where: Prisma.CargoPackageWhereInput = {
    status: options.status ?? "ACTIVE",
    ...(options.q ? { OR: [{ packageNo: { contains: options.q, mode: "insensitive" } }, { notes: { contains: options.q, mode: "insensitive" } }, { vendor: { name: { contains: options.q, mode: "insensitive" } } }, { shipment: { shipmentNo: { contains: options.q, mode: "insensitive" } } }] } : {}),
    ...(options.vendorId ? { vendorId: options.vendorId } : {}),
    ...(options.route || options.forwarderId || options.sourceWarehouseId || stageIds ? { shipment: { ...(options.route ? { route: options.route } : {}), ...(options.forwarderId ? { forwarderId: options.forwarderId } : {}), ...(options.sourceWarehouseId ? { sourceWarehouseId: options.sourceWarehouseId } : {}), ...(stageIds ? { id: { in: stageIds } } : {}) } } : {}),
  }
  const rows = await db.cargoPackage.findMany({
    take: limit + (options.cursor ? 1 : 0),
    skip: options.cursor ? 1 : (pageNumber - 1) * limit,
    ...(options.cursor ? { cursor: { id: options.cursor } } : {}),
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true, packageNo: true, shipmentId: true, status: true, weight: true, verifiedWeight: true, createdAt: true,
      vendor: { select: { id: true, name: true } },
      shipment: {
        select: {
          shipmentNo: true, route: true,
          forwarder: { select: { name: true } },
          milestones: { orderBy: { sequence: "desc" }, take: 1, select: { stage: true } },
        },
      },
      _count: { select: { items: true, files: true } },
    },
  })
  const total = await db.cargoPackage.count({ where })
  const result = options.cursor ? rows.slice(0, limit) : rows
  return {
    packages: result.map(row => ({
      ...row,
      stage: row.shipment.milestones[0]?.stage ?? "NEEDS_REVIEW",
      shipment: { ...row.shipment, milestones: undefined },
      weight: row.weight?.toString() ?? null,
      verifiedWeight: row.verifiedWeight?.toString() ?? null,
    })),
    total, page: pageNumber, pageSize: limit, pageCount: Math.ceil(total / limit),
    nextCursor: options.cursor && rows.length > limit ? result.at(-1)?.id ?? null : null,
  }
}

export async function cargoNameSuggestions(kind: "shipment" | "package", q: string) {
  if (!q.trim()) return []
  return kind === "shipment"
    ? (await db.cargoShipment.findMany({ where: { shipmentNo: { startsWith: q.trim(), mode: "insensitive" } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, shipmentNo: true, createdAt: true } })).map(row => ({ id: row.id, value: row.shipmentNo, createdAt: row.createdAt }))
    : (await db.cargoPackage.findMany({ where: { packageNo: { startsWith: q.trim(), mode: "insensitive" } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, packageNo: true, createdAt: true } })).map(row => ({ id: row.id, value: row.packageNo, createdAt: row.createdAt }))
}

export async function cargoShipmentDetail(id: string, permissions: string[]) {
  const costs = permissions.includes("cargo.costs.view")
  const docs = permissions.includes("cargo.documents.view")
  return db.cargoShipment.findUnique({ where: { id }, include: {
    forwarder: true, sourceWarehouse: true, createdBy: { select: { name: true } },
    packages: { include: { vendor: { select: { id: true, name: true } }, items: { orderBy: { sortOrder: "asc" } } }, orderBy: { packageNo: "asc" } },
    milestones: { orderBy: { sequence: "asc" } }, trackingLegs: { include: { courier: { select: { name: true } } }, orderBy: { sequence: "asc" } },
    legacyEvents: { orderBy: { occurredAt: "asc" } },
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
      SELECT COALESCE(latest.stage::text, 'NEEDS_REVIEW') AS stage, COUNT(*)::int AS count
      FROM cargo_shipments AS shipment
      LEFT JOIN LATERAL (
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
