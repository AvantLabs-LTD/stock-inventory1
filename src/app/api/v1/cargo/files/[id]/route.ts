import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { cargoApiError } from "@/lib/cargo-service"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "cargo.documents.view")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const file = await db.cargoFile.findUnique({ where: { id }, select: { data: true, fileName: true, contentType: true } })
    if (!file) return Response.json({ code: "NOT_FOUND", error: "File not found" }, { status: 404 })
    const safeName = file.fileName.replace(/["\\\r\n]/g, "_")
    const inline = request.nextUrl.searchParams.get("inline") === "1" && file.contentType.startsWith("image/")
    return new Response(new Uint8Array(file.data), { headers: { "Content-Type": file.contentType, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } })
  } catch (error) { return cargoApiError(error) }
}
