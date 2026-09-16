import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
export async function GET(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse(); if (!hasPermission(session, "vault.stock.view")) return forbiddenResponse()
  const entries = await db.inventoryLedgerEntry.findMany({ include: { item: { select: { code: true, title: true, unit: true } }, actor: { select: { name: true } } }, orderBy: { occurredAt: "desc" }, take: 500 })
  return Response.json({ entries })
}
