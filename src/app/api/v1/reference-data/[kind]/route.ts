import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { normalizeName, apiError } from "@/lib/inventory-service"

export async function POST(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  if (!await getSession(request)) return unauthorizedResponse()
  try {
    const { kind } = await context.params
    const body = await request.json()
    if (!body.name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 })
    const name = body.name.trim()
    const base = { name, normalizedName: normalizeName(name), description: body.description?.trim() || null }
    if (kind === "classifications") return Response.json({ record: await db.itemClassification.create({ data: { ...base, sortOrder: Number(body.sortOrder || 0) } }) }, { status: 201 })
    if (kind === "departments") return Response.json({ record: await db.departmentTag.create({ data: { ...base, code: body.code?.trim() || null } }) }, { status: 201 })
    if (kind === "projects") return Response.json({ record: await db.projectTag.create({ data: { ...base, code: body.code?.trim() || null } }) }, { status: 201 })
    if (kind === "vendors") return Response.json({ record: await db.vendor.create({ data: { ...base, contactPerson: body.contactPerson, phone: body.phone, email: body.email, address: body.address, remarks: body.remarks } }) }, { status: 201 })
    return Response.json({ error: "Unknown reference-data kind" }, { status: 404 })
  } catch (error) { return apiError(error) }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  if (!await getSession(request)) return unauthorizedResponse()
  try {
    const { kind } = await context.params
    const body = await request.json()
    if (!body.id) return Response.json({ error: "ID is required" }, { status: 400 })
    const data = { name: body.name?.trim(), normalizedName: body.name ? normalizeName(body.name) : undefined, description: body.description, status: body.status }
    if (kind === "classifications") return Response.json({ record: await db.itemClassification.update({ where: { id: body.id }, data: { ...data, sortOrder: body.sortOrder } }) })
    if (kind === "departments") return Response.json({ record: await db.departmentTag.update({ where: { id: body.id }, data: { ...data, code: body.code } }) })
    if (kind === "projects") return Response.json({ record: await db.projectTag.update({ where: { id: body.id }, data: { ...data, code: body.code } }) })
    if (kind === "vendors") return Response.json({ record: await db.vendor.update({ where: { id: body.id }, data: { ...data, contactPerson: body.contactPerson, phone: body.phone, email: body.email, address: body.address, remarks: body.remarks } }) })
    return Response.json({ error: "Unknown reference-data kind" }, { status: 404 })
  } catch (error) { return apiError(error) }
}
