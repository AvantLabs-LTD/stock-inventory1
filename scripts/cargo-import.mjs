// Historical PakLogix -> Flux Cargo import. Never point this at a live source DB.
// Usage: node scripts/cargo-import.mjs <snapshot-dir> --dry-run|--apply
//        --confirm-database=<target database> --defer-missing-photos
import { createHash } from "node:crypto"
import { execFileSync, spawnSync } from "node:child_process"
import { basename, join, resolve, sep } from "node:path"
import { existsSync, readFileSync, statSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const root = resolve(process.argv[2] || "")
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry-run" : null
const deferMissing = process.argv.includes("--defer-missing-photos")
const confirmedDatabase = process.argv.find(arg => arg.startsWith("--confirm-database="))?.split("=")[1]
if (!process.argv[2] || !mode || !existsSync(join(root, "custom.db"))) throw new Error("Specify snapshot directory and exactly one of --dry-run or --apply")
if (process.argv.includes("--apply") && process.argv.includes("--dry-run")) throw new Error("Choose one mode")
const dbName = new URL(process.env.DATABASE_URL || "postgresql://invalid/unknown").pathname.slice(1)
if (!confirmedDatabase || dbName !== confirmedDatabase) throw new Error("--confirm-database must match DATABASE_URL database name")
if (mode === "apply" && !process.env.IMPORT_ACTOR_EMAIL) throw new Error("IMPORT_ACTOR_EMAIL is required for --apply")
const sqlite = process.env.SQLITE3_BINARY || "sqlite3"
const preflight = spawnSync(process.execPath, [join(import.meta.dirname, "cargo-import-preflight.mjs"), root, ...(deferMissing ? ["--defer-missing-photos"] : [])], { encoding: "utf8", env: process.env, maxBuffer: 20 * 1024 * 1024 })
if (preflight.error) throw preflight.error
const checks = JSON.parse(preflight.stdout)
if (preflight.status !== 0 || !checks.readyForImportRehearsal) throw new Error(`Source preflight failed: ${checks.photos?.missing?.length || 0} missing photos, ${checks.sqlite?.foreignKeyViolations || 0} foreign-key violations, or unmapped statuses`)

const prisma = new PrismaClient()
const norm = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase()
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const asDate = value => value ? new Date(value) : null
const statusMap = { RECEIVED_BY_TAYYAB: "RECEIVED", "Reached in Global": "AT_SOURCE_WAREHOUSE", "Reached iN Global": "AT_SOURCE_WAREHOUSE", "Reached in warehouse": "AT_SOURCE_WAREHOUSE", "Reached in wherehouse": "AT_SOURCE_WAREHOUSE", "reached in warehouse": "AT_SOURCE_WAREHOUSE" }
function query(sql) {
  const output = execFileSync(sqlite, ["-json", join(root, "custom.db"), sql], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 })
  return output.trim() ? JSON.parse(output) : []
}
function sourceRows(table) { return query(`SELECT * FROM "${table}" ORDER BY id`) }
function pathFor(url) {
  const candidate = resolve(root, String(url).replace(/^\/+/, ""))
  if (!candidate.startsWith(resolve(root, "uploads") + sep)) throw new Error(`Unsafe upload URL: ${url}`)
  return candidate
}
function fileType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg"
  throw new Error("Unsupported historical photo signature")
}
async function mapped(tx, sourceType, row) {
  const previous = await tx.cargoImportRecord.findUnique({ where: { sourceType_sourceId: { sourceType, sourceId: row.id } } })
  if (previous && previous.sourceHash !== hash(row)) throw new Error(`Source changed since import: ${sourceType}/${row.id}`)
  return previous
}
async function record(tx, sourceType, row, targetType, targetId, reviewReason = null, sourceFacts = undefined) {
  const previous = await mapped(tx, sourceType, row)
  if (previous?.targetId && previous.targetId !== targetId) throw new Error(`Conflicting import target: ${sourceType}/${row.id}`)
  await tx.cargoImportRecord.upsert({
    where: { sourceType_sourceId: { sourceType, sourceId: row.id } },
    create: { sourceType, sourceId: row.id, sourceHash: hash(row), targetType, targetId, reviewReason, sourceFacts },
    update: { targetType, targetId, reviewReason, sourceFacts },
  })
}
const vendors = sourceRows("Vendor")
const couriers = sourceRows("Courier")
const packages = sourceRows("Package")
const items = sourceRows("PackageItem")
const photos = sourceRows("PackagePhoto")
const events = sourceRows("TimelineEntry")
const tracking = sourceRows("CourierTracking")
const invoices = sourceRows("Invoice")
const byPackage = (rows, key = "packageId") => Map.groupBy(rows, row => row[key])
const itemsByPackage = byPackage(items)
const photosByPackage = byPackage(photos)
const eventsByPackage = byPackage(events)
const missingIds = new Set(checks.photos.missing.map(photo => photo.sourceId))
const unreferencedUploads = checks.photos.unreferencedUploadHashes.map(row => ({ id: row.path, bytes: row.bytes, sha256: row.sha256 }))
const sourceRecords = [
  ...vendors.map(row => ["VENDOR", row]), ...couriers.map(row => ["COURIER", row]),
  ...packages.map(row => ["PACKAGE", row]), ...items.map(row => ["PACKAGE_ITEM", row]),
  ...photos.map(row => ["PACKAGE_PHOTO", row]), ...events.map(row => ["TIMELINE", row]),
  ...tracking.map(row => ["COURIER_TRACKING", row]),
  ...tracking.filter(row => row.amount !== null).map(row => ["TRACKING_AMOUNT", { id: row.id, amount: row.amount, paymentType: row.paymentType }]),
  ...invoices.map(row => ["INVOICE", row]),
  ...unreferencedUploads.map(row => ["UNREFERENCED_UPLOAD", row]),
]

try {
  const actor = process.env.IMPORT_ACTOR_EMAIL ? await prisma.user.findFirst({ where: { email: { equals: process.env.IMPORT_ACTOR_EMAIL, mode: "insensitive" }, status: "ACTIVE" }, select: { id: true, email: true } }) : null
  if (mode === "apply" && !actor) throw new Error("Active IMPORT_ACTOR_EMAIL not found in Flux")
  const existingPackages = await prisma.cargoPackage.findMany({ where: { packageNo: { in: packages.map(row => row.packageId) } }, select: { id: true, packageNo: true } })
  const collisions = existingPackages.filter(row => row.id !== packages.find(source => source.packageId === row.packageNo)?.id)
  if (collisions.length) throw new Error(`Cargo package number collision: ${collisions.map(row => row.packageNo).join(", ")}`)
  const sourcePackageIds = new Set(packages.map(row => row.id))
  const targetPackagesById = await prisma.cargoPackage.findMany({ where: { id: { in: [...sourcePackageIds] } }, select: { id: true, packageNo: true } })
  const idCollisions = targetPackagesById.filter(row => packages.find(source => source.id === row.id)?.packageId !== row.packageNo)
  if (idCollisions.length) throw new Error(`Cargo package ID collision: ${idCollisions.map(row => row.id).join(", ")}`)
  const courierCodes = couriers.map(row => row.code).filter(Boolean)
  const courierCodeMatches = await prisma.cargoCourier.findMany({ where: { code: { in: courierCodes } }, select: { code: true, normalizedName: true } })
  const courierCodeCollisions = courierCodeMatches.filter(row => !couriers.some(source => source.code === row.code && norm(source.name) === row.normalizedName))
  if (courierCodeCollisions.length) throw new Error(`Cargo courier code collision: ${courierCodeCollisions.map(row => row.code).join(", ")}`)
  const imported = await prisma.cargoImportRecord.findMany({ select: { sourceType: true, sourceId: true, sourceHash: true } })
  const oldHashes = new Map(imported.map(row => [`${row.sourceType}/${row.sourceId}`, row.sourceHash]))
  const changed = sourceRecords.filter(([type, row]) => oldHashes.has(`${type}/${row.id}`) && oldHashes.get(`${type}/${row.id}`) !== hash(row))
  if (changed.length) throw new Error(`Previously imported source rows changed: ${changed.slice(0, 10).map(([type, row]) => `${type}/${row.id}`).join(", ")}`)
  const photoHashes = new Map(checks.photos.hashes.map(row => [row.sourceId, row.sha256]))
  const existingFiles = await prisma.cargoFile.findMany({ where: { id: { in: [...photoHashes.keys()] } }, select: { id: true, sha256: true } })
  const changedFiles = existingFiles.filter(row => row.sha256 !== photoHashes.get(row.id))
  if (changedFiles.length) throw new Error(`Previously imported photo bytes changed: ${changedFiles.slice(0, 10).map(row => row.id).join(", ")}`)
  const shipmentNos = [...packages.map(row => `LOGIX-${row.packageId}`), ...tracking.map(row => `LOGIX-TRACK-${row.id}`)]
  const existingShipments = await prisma.cargoShipment.findMany({ where: { shipmentNo: { in: shipmentNos } }, select: { id: true, shipmentNo: true } })
  const expectedShipmentId = new Map([...packages.map(row => [`LOGIX-${row.packageId}`, `logix-package:${row.id}`]), ...tracking.map(row => [`LOGIX-TRACK-${row.id}`, `logix-tracking:${row.id}`])])
  const shipmentCollisions = existingShipments.filter(row => row.id !== expectedShipmentId.get(row.shipmentNo))
  if (shipmentCollisions.length) throw new Error(`Shipment number collision: ${shipmentCollisions.map(row => row.shipmentNo).join(", ")}`)
  const preview = {
    mode, database: dbName, source: { packages: packages.length, items: items.length, photos: photos.length, events: events.length, tracking: tracking.length, invoices: invoices.length, vendors: vendors.length, couriers: couriers.length },
    missingPhotosDeferred: missingIds.size, unreferencedUploadsNeedingReview: unreferencedUploads.length, groupingCandidates: checks.groupingCandidates.length,
    trackingAmountsNeedingCurrency: checks.tracking.amountsWithoutExplicitCurrency,
    vendorExactMatches: (await prisma.vendor.findMany({ where: { normalizedName: { in: vendors.map(row => norm(row.name)) } }, select: { normalizedName: true } })).length,
    existingImportRecords: imported.length,
  }
  if (mode === "dry-run") { process.stdout.write(JSON.stringify(preview, null, 2) + "\n"); process.exit(0) }

  const vendorIds = new Map()
  for (const row of vendors) {
    await prisma.$transaction(async tx => {
      await mapped(tx, "VENDOR", row)
      const vendor = await tx.vendor.upsert({ where: { normalizedName: norm(row.name) }, create: { name: row.name, normalizedName: norm(row.name), contactPerson: row.contactPerson, phone: row.phone, email: row.email, address: row.address, remarks: row.notes, status: row.isActive ? "ACTIVE" : "INACTIVE" }, update: {} })
      vendorIds.set(row.id, vendor.id)
      await record(tx, "VENDOR", row, "Vendor", vendor.id, null, { sourceName: row.name })
    })
  }
  const courierIds = new Map()
  for (const row of couriers) {
    await prisma.$transaction(async tx => {
      await mapped(tx, "COURIER", row)
      const courier = await tx.cargoCourier.upsert({ where: { normalizedName: norm(row.name) }, create: { name: row.name, normalizedName: norm(row.name), code: row.code, phone: row.phone, website: row.website, notes: row.notes, status: row.isActive ? "ACTIVE" : "INACTIVE" }, update: {} })
      courierIds.set(row.id, courier.id)
      await record(tx, "COURIER", row, "CargoCourier", courier.id, null, { sourceName: row.name })
    })
  }
  for (const carrier of new Set(tracking.map(row => row.carrier).filter(Boolean))) {
    const courier = await prisma.cargoCourier.upsert({ where: { normalizedName: norm(carrier) }, create: { name: carrier, normalizedName: norm(carrier) }, update: {} })
    courierIds.set(`carrier:${norm(carrier)}`, courier.id)
  }
  const warehouseIds = new Map()
  for (const rawName of new Set(packages.map(row => row.warehouse).filter(Boolean))) {
    const name = rawName.trim().toUpperCase() === "PAKSINO" ? "PakSino" : rawName.trim().toUpperCase() === "GLOBAL" ? "Global" : null
    if (!name) throw new Error(`Unreviewed source warehouse: ${rawName}`)
    const forwarder = await prisma.cargoForwarder.upsert({ where: { normalizedName: norm(name) }, create: { name, normalizedName: norm(name), notes: "Created during PakLogix historical import" }, update: {} })
    const warehouse = await prisma.cargoSourceWarehouse.upsert({ where: { forwarderId_normalizedName: { forwarderId: forwarder.id, normalizedName: "legacy source warehouse" } }, create: { forwarderId: forwarder.id, name: "Legacy source warehouse", normalizedName: "legacy source warehouse", notes: `Historical ${rawName} warehouse; physical address not supplied` }, update: {} })
    warehouseIds.set(rawName, { forwarderId: forwarder.id, sourceWarehouseId: warehouse.id })
  }
  for (const row of packages) {
    const shipmentId = `logix-package:${row.id}`
    const warehouse = warehouseIds.get(row.warehouse)
    if (!warehouse) throw new Error(`Package ${row.packageId} has no reviewed warehouse mapping`)
    const last = [...(eventsByPackage.get(row.id) || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id)).at(-1)
    const stage = statusMap[row.status]
    if (!stage || !last || last.status !== row.status) throw new Error(`Package ${row.packageId} status/timeline review failed`)
    await prisma.$transaction(async tx => {
      const previous = await mapped(tx, "PACKAGE", row)
      if (previous?.targetId) return
      await tx.cargoShipment.create({ data: { id: shipmentId, shipmentNo: `LOGIX-${row.packageId}`, route: "FORWARDED", ...warehouse, createdById: actor.id, notes: "Imported from PakLogix; legacy shipment grouping not inferred", createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt), milestones: { create: { id: `logix-stage:${row.id}`, sequence: 0, stage, occurredAt: asDate(last.createdAt), remarks: `Original Logix status: ${row.status}`, postedById: actor.id } } } })
      await tx.cargoPackage.create({ data: { id: row.id, packageNo: row.packageId, shipmentId, vendorId: row.vendorId ? vendorIds.get(row.vendorId) : null, weight: row.weight, verifiedWeight: row.verifiedWeight, length: row.length, width: row.width, height: row.height, notes: row.notes, createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt) } })
      if (row.courierId || row.trackingNumber) await tx.cargoTrackingLeg.create({ data: { id: `logix-leg:${row.id}`, shipmentId, sequence: 0, kind: "SOURCE_INLAND", courierId: row.courierId ? courierIds.get(row.courierId) : null, trackingNumber: row.trackingNumber, remarks: "Original package courier/tracking reference" } })
      await record(tx, "PACKAGE", row, "CargoPackage", row.id, null, { legacyQuantity: row.quantity, senderName: row.senderName, senderPhone: row.senderPhone, warehouse: row.warehouse, rawStatus: row.status, receivedDate: row.receivedDate, deliveredDate: row.deliveredDate, originalCostFields: { productCost: row.productCost, chinaCourierCost: row.chinaCourierCost, cargoCost: row.cargoCost, customsCost: row.customsCost, deliveryCost: row.deliveryCost, otherExpenses: row.otherExpenses } })
    })
    let sortOrder = 0
    for (const item of itemsByPackage.get(row.id) || []) {
      await prisma.$transaction(async tx => {
        const previous = await mapped(tx, "PACKAGE_ITEM", item)
        if (previous?.targetId) return
        await tx.cargoPackageItem.create({ data: { id: item.id, packageId: row.id, description: item.packageName, quantity: item.quantity, notes: item.notes, sortOrder, createdAt: asDate(item.createdAt) } })
        await record(tx, "PACKAGE_ITEM", item, "CargoPackageItem", item.id)
      })
      sortOrder++
    }
    for (const event of eventsByPackage.get(row.id) || []) {
      await prisma.$transaction(async tx => {
        const previous = await mapped(tx, "TIMELINE", event)
        if (previous?.targetId) return
        await tx.cargoLegacyEvent.create({ data: { id: event.id, shipmentId, packageId: row.id, rawStatus: event.status, description: event.description, location: event.location, sourceUserId: event.userId, occurredAt: asDate(event.createdAt) } })
        await record(tx, "TIMELINE", event, "CargoLegacyEvent", event.id)
      })
    }
    for (const photo of photosByPackage.get(row.id) || []) {
      await prisma.$transaction(async tx => {
        const previous = await mapped(tx, "PACKAGE_PHOTO", photo)
        if (previous?.targetId) return
        if (missingIds.has(photo.id)) {
          await record(tx, "PACKAGE_PHOTO", photo, null, null, "PHOTO_FILE_MISSING", { packageId: row.id, url: photo.url, type: photo.type, fileName: photo.fileName })
          return
        }
        const filePath = pathFor(photo.url)
        const bytes = readFileSync(filePath)
        const contentType = fileType(bytes)
        const fileHash = createHash("sha256").update(bytes).digest("hex")
        if (fileHash !== photoHashes.get(photo.id)) throw new Error(`Photo changed after preflight: ${photo.id}`)
        const kind = photo.type === "carton" ? "CARTON_PHOTO" : photo.type === "product" ? "CONTENT_PHOTO" : photo.type === "receipt" ? "RECEIPT" : "OTHER"
        await tx.cargoFile.create({ data: { id: photo.id, shipmentId, packageId: row.id, kind, fileName: (photo.fileName || basename(filePath)).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180), contentType, sizeBytes: statSync(filePath).size, sha256: fileHash, data: bytes, uploadedById: actor.id, createdAt: asDate(photo.createdAt) } })
        await record(tx, "PACKAGE_PHOTO", photo, "CargoFile", photo.id, null, { sourceUrl: photo.url })
      })
    }
  }
  for (const row of tracking) {
    const shipmentId = `logix-tracking:${row.id}`
    await prisma.$transaction(async tx => {
      const previous = await mapped(tx, "COURIER_TRACKING", row)
      if (previous?.targetId) return
      await tx.cargoShipment.create({ data: { id: shipmentId, shipmentNo: `LOGIX-TRACK-${row.id}`, route: "DIRECT", createdById: actor.id, notes: "Imported standalone Logix courier tracking; journey stage needs review", createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt) } })
      await tx.cargoTrackingLeg.create({ data: { id: row.id, shipmentId, sequence: 0, kind: "INTERNATIONAL", courierId: courierIds.get(`carrier:${norm(row.carrier)}`), trackingNumber: row.trackingId, dispatchedAt: asDate(row.date), remarks: row.remarks } })
      await record(tx, "COURIER_TRACKING", row, "CargoShipment", shipmentId, null, { carrier: row.carrier, packageId: row.packageId, size: row.size, weight: row.weight, sender: row.sender, itemDetails: row.itemDetails, currentStatus: row.currentStatus, paymentType: row.paymentType, edd: row.edd, highlight: row.highlight })
    })
    if (row.amount !== null) await prisma.$transaction(tx => record(tx, "TRACKING_AMOUNT", { id: row.id, amount: row.amount, paymentType: row.paymentType }, null, null, "CURRENCY_REQUIRED", { shipmentId, amount: row.amount, paymentType: row.paymentType }))
  }
  for (const row of invoices) await prisma.$transaction(tx => record(tx, "INVOICE", row, null, null, "SHIPMENT_LINK_REQUIRED", row))
  for (const row of unreferencedUploads) await prisma.$transaction(tx => record(tx, "UNREFERENCED_UPLOAD", row, null, null, "NO_SOURCE_DATABASE_REFERENCE", { path: row.id, bytes: row.bytes, sha256: row.sha256 }))

  const records = await prisma.cargoImportRecord.groupBy({ by: ["sourceType", "reviewReason"], _count: { sourceId: true } })
  const targetCounts = {
    packageShipments: await prisma.cargoShipment.count({ where: { id: { in: packages.map(row => `logix-package:${row.id}`) } } }),
    trackingShipments: await prisma.cargoShipment.count({ where: { id: { in: tracking.map(row => `logix-tracking:${row.id}`) } } }),
    packages: await prisma.cargoPackage.count({ where: { id: { in: packages.map(row => row.id) } } }),
    items: await prisma.cargoPackageItem.count({ where: { id: { in: items.map(row => row.id) } } }),
    photos: await prisma.cargoFile.count({ where: { id: { in: photos.filter(row => !missingIds.has(row.id)).map(row => row.id) } } }),
    legacyEvents: await prisma.cargoLegacyEvent.count({ where: { id: { in: events.map(row => row.id) } } }),
  }
  if (targetCounts.packageShipments !== packages.length || targetCounts.trackingShipments !== tracking.length || targetCounts.packages !== packages.length || targetCounts.items !== items.length || targetCounts.photos !== photos.length - missingIds.size || targetCounts.legacyEvents !== events.length) throw new Error(`Target count reconciliation failed: ${JSON.stringify(targetCounts)}`)
  process.stdout.write(JSON.stringify({ ...preview, targetCounts, result: records.map(row => ({ sourceType: row.sourceType, reviewReason: row.reviewReason, count: row._count.sourceId })) }, null, 2) + "\n")
} finally { await prisma.$disconnect() }
