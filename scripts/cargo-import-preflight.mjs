// Read-only inspection of a PakLogix SQLite snapshot and its uploads directory.
// Usage: node scripts/cargo-import-preflight.mjs <snapshot-directory>
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { resolve, relative, sep, join } from "node:path"
import { execFileSync } from "node:child_process"

const root = resolve(process.argv[2] || "")
if (!process.argv[2] || !existsSync(join(root, "custom.db")) || !existsSync(join(root, "uploads"))) {
  throw new Error("Pass a snapshot directory containing custom.db and uploads/")
}

const sqlite = process.env.SQLITE3_BINARY || "sqlite3"
function query(sql) {
  const output = execFileSync(sqlite, ["-json", join(root, "custom.db"), sql], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 })
  return output.trim() ? JSON.parse(output) : []
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

const integrity = query("PRAGMA integrity_check")
const foreignKeys = query("PRAGMA foreign_key_check")
const entities = ["Package", "PackageItem", "PackagePhoto", "TimelineEntry", "CourierTracking", "CourierTrackingPhoto", "Invoice", "Vendor", "Courier", "Forwarder", "Shipment"]
const counts = Object.fromEntries(entities.map(table => [table, query(`SELECT COUNT(*) AS count FROM \"${table}\"`)[0].count]))
const statuses = query('SELECT status, COUNT(*) AS count FROM "Package" GROUP BY status ORDER BY status')
const latestMismatch = query(`WITH latest AS (
  SELECT "packageId", status, ROW_NUMBER() OVER (PARTITION BY "packageId" ORDER BY "createdAt" DESC, id DESC) AS rownum FROM "TimelineEntry"
) SELECT p.id, p.status AS "packageStatus", latest.status AS "latestTimelineStatus"
  FROM "Package" p LEFT JOIN latest ON latest."packageId" = p.id AND latest.rownum = 1
  WHERE latest.status IS NULL OR latest.status <> p.status`)
const photos = query('SELECT id, "packageId", url, type FROM "PackagePhoto" ORDER BY id')
const uploadRoot = resolve(root, "uploads")
const missingPhotos = []
const oversizedPhotos = []
const photoHashes = []
const referencedPaths = new Set()
for (const photo of photos) {
  const relativeUrl = String(photo.url || "").replace(/^\/+/, "")
  const candidate = resolve(root, relativeUrl)
  const inside = candidate.startsWith(uploadRoot + sep)
  if (!inside || !existsSync(candidate)) {
    missingPhotos.push({ sourceId: photo.id, packageId: photo.packageId, url: photo.url })
    continue
  }
  const bytes = statSync(candidate).size
  if (bytes < 1 || bytes > 5 * 1024 * 1024) oversizedPhotos.push({ sourceId: photo.id, bytes })
  referencedPaths.add(candidate)
  photoHashes.push({ sourceId: photo.id, sha256: createHash("sha256").update(readFileSync(candidate)).digest("hex"), bytes })
}
const unreferencedUploads = walk(uploadRoot).filter(path => !referencedPaths.has(resolve(path))).map(path => relative(root, path).replaceAll(sep, "/"))
const groupingCandidates = query(`SELECT TRIM("trackingNumber") AS tracking, COUNT(*) AS packageCount
  FROM "Package" WHERE "trackingNumber" IS NOT NULL AND TRIM("trackingNumber") <> ''
  GROUP BY TRIM("trackingNumber") HAVING COUNT(*) > 1 ORDER BY packageCount DESC`)
const trackingMatches = query(`SELECT COUNT(*) AS count FROM "CourierTracking" c JOIN "Package" p
  ON TRIM(c."trackingId") = TRIM(p."trackingNumber")
  WHERE c."trackingId" IS NOT NULL AND TRIM(c."trackingId") <> ''`)[0].count
const ambiguousTrackingCharges = query('SELECT COUNT(*) AS count FROM "CourierTracking" WHERE amount IS NOT NULL')[0].count
const invoiceLinkage = query('SELECT COUNT(*) AS count, SUM(CASE WHEN "trackingId" IS NOT NULL THEN 1 ELSE 0 END) AS linked FROM "Invoice"')[0]
const statusMap = { RECEIVED_BY_TAYYAB: "RECEIVED", "Reached in Global": "AT_SOURCE_WAREHOUSE", "Reached iN Global": "AT_SOURCE_WAREHOUSE", "Reached in warehouse": "AT_SOURCE_WAREHOUSE", "Reached in wherehouse": "AT_SOURCE_WAREHOUSE", "reached in warehouse": "AT_SOURCE_WAREHOUSE" }
const unmappedStatuses = statuses.filter(row => !statusMap[row.status])
const report = {
  snapshot: root,
  sqlite: { integrity: integrity[0]?.integrity_check, foreignKeyViolations: foreignKeys.length },
  counts, statuses: statuses.map(row => ({ ...row, cargoStage: statusMap[row.status] || null })),
  latestStatusMismatches: latestMismatch,
  photos: { referenced: photos.length, verified: photoHashes.length, missing: missingPhotos, outsideLimit: oversizedPhotos, unreferencedUploadCount: unreferencedUploads.length, unreferencedUploads, hashes: photoHashes },
  groupingCandidates,
  tracking: { exactPackageTrackingMatches: trackingMatches, amountsWithoutExplicitCurrency: ambiguousTrackingCharges },
  invoices: { count: invoiceLinkage.count, linkedToTracking: invoiceLinkage.linked || 0 },
  readyForImportRehearsal: integrity[0]?.integrity_check === "ok" && foreignKeys.length === 0 && !missingPhotos.length && !oversizedPhotos.length && !latestMismatch.length && !unmappedStatuses.length,
}
process.stdout.write(JSON.stringify(report, null, 2) + "\n")
if (!report.readyForImportRehearsal) process.exitCode = 2
