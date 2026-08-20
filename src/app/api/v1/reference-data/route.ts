import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"

export async function GET(request: NextRequest) {
  if (!await getSession(request)) return unauthorizedResponse()
  const [classifications, departments, projects, vendors] = await Promise.all([
    db.itemClassification.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.departmentTag.findMany({ orderBy: { name: "asc" } }),
    db.projectTag.findMany({ orderBy: { name: "asc" } }),
    db.vendor.findMany({ orderBy: { name: "asc" } }),
  ])
  return Response.json({ classifications, departments, projects, vendors })
}
