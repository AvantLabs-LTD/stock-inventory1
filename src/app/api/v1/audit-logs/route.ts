import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
export async function GET(request: NextRequest) {
  if (!await getSession(request)) return unauthorizedResponse()
  return Response.json({ logs: await db.auditLog.findMany({ orderBy: { date: "desc" }, take: 500 }) })
}
