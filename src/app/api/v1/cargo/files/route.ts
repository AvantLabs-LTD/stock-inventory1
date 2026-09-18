import { createHash } from "node:crypto"
import { CargoFileKind, Prisma } from "@prisma/client"
import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { CargoError, cargoApiError } from "@/lib/cargo-service"
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits"

function detectedType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 4).toString() === "%PDF") return "application/pdf"
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg"
  return null
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "cargo.documents.manage")) return forbiddenResponse()
  try {
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) throw new CargoError("FILE_REQUIRED", "Select a file")
    if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) throw new CargoError("FILE_SIZE", "File must be between 1 byte and 5 MB", 413)
    const bytes = Buffer.from(await file.arrayBuffer())
    const contentType = detectedType(bytes)
    if (!contentType || file.type !== contentType) throw new CargoError("INVALID_FILE_TYPE", "Only valid PDF, PNG, and JPEG files are supported")
    const kind = String(form.get("kind") || "") as CargoFileKind
    if (!Object.values(CargoFileKind).includes(kind)) throw new CargoError("INVALID_FILE_KIND", "Choose a file category")
    if ((kind === "CONTENT_PHOTO" || kind === "CARTON_PHOTO") && !contentType.startsWith("image/")) throw new CargoError("INVALID_FILE_TYPE", "Package photos must be images")
    const shipmentId = String(form.get("shipmentId") || "")
    const packageId = String(form.get("packageId") || "") || null
    const invoiceId = String(form.get("invoiceId") || "") || null
    if (!shipmentId) throw new CargoError("SHIPMENT_REQUIRED", "Choose a shipment")
    if ((kind === "CONTENT_PHOTO" || kind === "CARTON_PHOTO") && !packageId) throw new CargoError("PACKAGE_REQUIRED", "Choose a package for its photo")
    const fileName = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "file"
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    const key = request.headers.get("idempotency-key")?.trim()
    if (key && !/^[A-Za-z0-9._:-]{8,120}$/.test(key)) throw new CargoError("INVALID_IDEMPOTENCY_KEY", "Use an 8–120 character idempotency key")
    const requestHash = createHash("sha256").update(JSON.stringify({ shipmentId, packageId, invoiceId, kind, fileName, contentType, sha256 })).digest("hex")
    const record = await db.$transaction(async tx => {
      if (key) {
        const previous = await tx.cargoRequestKey.findUnique({ where: { actorId_key: { actorId: session.user.id, key } } })
        if (previous) {
          if (previous.requestHash !== requestHash) throw new CargoError("IDEMPOTENCY_KEY_CONFLICT", "This key was used for different Cargo input", 409)
          if (previous.response === null) throw new CargoError("IDEMPOTENCY_IN_PROGRESS", "Request is still being committed; retry shortly", 409)
          return previous.response
        }
        await tx.cargoRequestKey.create({ data: { actorId: session.user.id, key, action: "file.upload", requestHash } })
      }
      const row = await tx.cargoFile.create({ data: { shipmentId, packageId, invoiceId, kind, fileName, contentType, sizeBytes: bytes.length, sha256, data: bytes, uploadedById: session.user.id }, select: { id: true, shipmentId: true, packageId: true, invoiceId: true, kind: true, fileName: true, contentType: true, sizeBytes: true, sha256: true, createdAt: true } })
      await tx.auditLog.create({ data: { userId: session.user.id, userName: session.credential.type === "service_token" ? `${session.user.name} (API: ${session.credential.name})` : session.user.name, action: "CARGO_FILE_UPLOAD", entityType: "CargoFile", entityId: row.id, details: JSON.stringify({ shipmentId, packageId, invoiceId, kind, fileName, sizeBytes: bytes.length, sha256 }) } })
      if (key) await tx.cargoRequestKey.update({ where: { actorId_key: { actorId: session.user.id, key } }, data: { response: JSON.parse(JSON.stringify(row)) } })
      return row
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return Response.json({ file: record }, { status: 201 })
  } catch (error) { return cargoApiError(error) }
}
