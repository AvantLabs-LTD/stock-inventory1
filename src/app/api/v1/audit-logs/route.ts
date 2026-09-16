import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
export async function GET(request: NextRequest) {
  const session = await getSession(request); if (!session) return unauthorizedResponse(); if (!hasPermission(session, "flux.audit.view")) return forbiddenResponse()
  return Response.json({ logs: await db.auditLog.findMany({ orderBy: { date: "desc" }, take: 500 }) })
}
