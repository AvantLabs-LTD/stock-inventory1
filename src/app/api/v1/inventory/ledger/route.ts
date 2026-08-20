import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
export async function GET(request: NextRequest) {
  if (!await getSession(request)) return unauthorizedResponse()
  const entries = await db.inventoryLedgerEntry.findMany({ include: { item: { select: { code: true, title: true, unit: true } }, actor: { select: { name: true } } }, orderBy: { occurredAt: "desc" }, take: 500 })
  return Response.json({ entries })
}
