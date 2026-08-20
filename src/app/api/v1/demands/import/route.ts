import { NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, createDemand, DomainError, normalizeName } from "@/lib/inventory-service"
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits"

export async function POST(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse()
  try {
    const form = await request.formData(); const file = form.get("file")
    if (!(file instanceof File)) throw new DomainError("FILE_REQUIRED", "Select an .xlsx file")
    if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("FILE_TOO_LARGE", "The upload limit is 5 MB", 413)
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new DomainError("INVALID_FILE_TYPE", "Only .xlsx files are accepted")
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
    if (!rows.length) throw new DomainError("EMPTY_WORKBOOK", "The workbook has no demand rows")
    const classifications = await db.itemClassification.findMany()
    const classByName = new Map(classifications.map(x => [normalizeName(x.name), x.id]))
    const lines: Array<{ itemId?: string; title: string; description: string | null; quantity: number; unit: string; classificationId: string; projectName: string | null; vendorName: string | null; remarks: string | null }> = []
    for (const row of rows) {
      const code = String(row["Item Code"] || "").trim()
      const item = code ? await db.item.findUnique({ where: { code } }) : null
      const className = String(row["Classification"] || "").trim()
      const classificationId = className ? classByName.get(normalizeName(className)) : item?.defaultClassificationId
      if (!classificationId) throw new DomainError("CLASSIFICATION_REQUIRED", "Unknown or missing classification for " + (code || row["Title"]))
      lines.push({ itemId: item?.id, title: String(row["Title"] || item?.title || "").trim(), description: String(row["Description"] || "").trim() || null,
        quantity: row["Quantity"] as number, unit: String(row["Unit"] || item?.unit || "pcs"), classificationId,
        projectName: String(row["Project"] || "").trim() || null, vendorName: String(row["Vendor"] || "").trim() || null,
        remarks: String(row["Remarks"] || "").trim() || null })
    }
    const demand = await createDemand({ requestedById: session.user.id, departmentName: String(form.get("department") || "").trim() || null, remarks: String(form.get("remarks") || "").trim() || null, lines })
    return Response.json({ demand }, { status: 201 })
  } catch (e) { return apiError(e) }
}
