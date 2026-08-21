import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasRole, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError, normalizeName } from "@/lib/inventory-service"
import { parseInventoryMaster } from "@/lib/inventory-master-import"
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits"

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasRole(session, "INVENTORY_MANAGER")) return forbiddenResponse()
  try {
    const form = await request.formData()
    const file = form.get("file")
    const mode = String(form.get("mode") || "preview")
    if (!(file instanceof File)) throw new DomainError("FILE_REQUIRED", "Select the consolidated inventory .xlsx file")
    if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("FILE_TOO_LARGE", "The upload limit is 5 MB", 413)
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new DomainError("INVALID_FILE_TYPE", "Only .xlsx files are accepted")
    const buffer = await file.arrayBuffer()
    const signature = new Uint8Array(buffer.slice(0, 4))
    if (signature[0] !== 0x50 || signature[1] !== 0x4b) throw new DomainError("INVALID_FILE_SIGNATURE", "The file is not a valid .xlsx workbook")
    const parsed = parseInventoryMaster(buffer)
    if (mode === "preview") return Response.json({ summary: { ...parsed.summary, total: parsed.candidates.length }, sample: parsed.candidates.slice(0, 20) })
    if (mode !== "commit") throw new DomainError("INVALID_IMPORT_MODE", "Import mode must be preview or commit")

    const result = await db.$transaction(async tx => {
      const roots = await tx.itemCategory.findMany({ where: { parentId: null } })
      const rootByName = new Map(roots.map(category => [normalizeName(category.name), category]))
      const leafByPath = new Map<string, string>()
      for (const row of parsed.candidates) {
        if (!row.familyName) continue
        const root = rootByName.get(normalizeName(row.categoryName))
        if (!root) throw new DomainError("IMPORT_CATEGORY_MISSING", `Missing catalogue category: ${row.categoryName}`)
        const normalizedName = normalizeName(row.familyName)
        const path = `${root.id}:${normalizedName}`
        if (leafByPath.has(path)) continue
        const leaf = await tx.itemCategory.upsert({
          where: { parentId_normalizedName: { parentId: root.id, normalizedName } },
          update: { name: row.familyName, discipline: row.discipline, status: "ACTIVE" },
          create: { name: row.familyName, normalizedName, discipline: row.discipline, parentId: root.id },
        })
        leafByPath.set(path, leaf.id)
      }

      let created = 0, updated = 0, openingEntries = 0, openingQuantity = new Prisma.Decimal(0)
      for (const row of parsed.candidates) {
        const root = rootByName.get(normalizeName(row.categoryName))
        if (!root) throw new DomainError("IMPORT_CATEGORY_MISSING", `Missing catalogue category: ${row.categoryName}`)
        const categoryId = row.familyName ? leafByPath.get(`${root.id}:${normalizeName(row.familyName)}`)! : root.id
        const existing = await tx.item.findUnique({ where: { importSourceKey: row.sourceKey } })
        const item = await tx.item.upsert({
          where: { importSourceKey: row.sourceKey },
          // Re-imports are idempotent and never overwrite later catalogue corrections.
          update: {},
          create: {
            code: row.code, importSourceKey: row.sourceKey, title: row.title, discipline: row.discipline, categoryId, catalogueState: "COMPLETE",
            specification: row.specification, manufacturerName: row.manufacturerName, manufacturerPartNumber: row.manufacturerPartNumber,
            supplierPartNumber: row.supplierPartNumber, unit: row.unit, remarks: row.remarks, createdById: session.user.id,
          },
        })
        if (existing) updated += 1
        else created += 1
        const balance = await tx.itemBalance.upsert({ where: { itemId: item.id }, update: {}, create: { itemId: item.id } })
        if (row.openingStock > 0) {
          const posted = await tx.inventoryLedgerEntry.findUnique({ where: { sourceType_sourceLineId: { sourceType: "INVENTORY_MASTER_IMPORT", sourceLineId: row.sourceKey } } })
          if (!posted && balance.onHand.eq(0)) {
            const quantity = new Prisma.Decimal(row.openingStock)
            await tx.itemBalance.update({ where: { itemId: item.id }, data: { onHand: quantity, version: { increment: 1 } } })
            await tx.inventoryLedgerEntry.create({ data: {
              itemId: item.id, type: "OPENING", quantity, onHandAfter: quantity,
              sourceType: "INVENTORY_MASTER_IMPORT", sourceId: file.name, sourceLineId: row.sourceKey,
              actorId: session.user.id, remarks: `Opening balance imported from ${row.sheet}`,
            } })
            openingEntries += 1
            openingQuantity = openingQuantity.plus(quantity)
          }
        }
      }
      await tx.auditLog.create({ data: { userId: session.user.id, userName: session.user.name, action: "IMPORT_INVENTORY_MASTER", entityType: "Item", details: JSON.stringify({ fileName: file.name, created, updated, openingEntries }) } })
      return { created, updated, openingEntries, openingQuantity: openingQuantity.toString() }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 })
    return Response.json({ summary: { ...parsed.summary, total: parsed.candidates.length }, result })
  } catch (error) { return apiError(error) }
}
