import { NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
export async function GET(request: NextRequest) {
  if (!await getSession(request)) return unauthorizedResponse()
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet([{ "Item Code": "", Title: "", Description: "", Quantity: 1, Unit: "pcs", Classification: "Foreign Standard Item", Project: "", Vendor: "", Remarks: "" }])
  XLSX.utils.book_append_sheet(workbook, sheet, "Demand")
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return new Response(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="demand-template.xlsx"' } })
}
