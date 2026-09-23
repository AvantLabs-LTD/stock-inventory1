import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"
import { normalizeName, apiError } from "@/lib/inventory-service"

async function auditReferenceChange(tx: Prisma.TransactionClient, input: { userId: string; userName: string; action: string; kind: string; record: { id: string } & Record<string, unknown> }) {
  await tx.auditLog.create({
    data: {
      userId: input.userId,
      userName: input.userName,
      action: input.action,
      entityType: input.kind,
      entityId: input.record.id,
      details: JSON.stringify({ kind: input.kind, record: input.record }),
    },
  })
}

export async function POST(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.reference.manage")) return forbiddenResponse()
  try {
    const { kind } = await context.params
    const body = await request.json()
    if (!body.name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 })
    const name = body.name.trim()
    const base = { name, normalizedName: normalizeName(name), description: body.description?.trim() || null }
    const record = await db.$transaction(async tx => {
      let created: ({ id: string } & Record<string, unknown>) | null = null
      if (kind === "itemCategories") created = await tx.itemCategory.create({ data: { ...base, discipline: body.discipline, parentId: body.parentId || null, sortOrder: Number(body.sortOrder || 0) } })
      if (kind === "departments") created = await tx.departmentTag.create({ data: { ...base, code: body.code?.trim() || null } })
      if (kind === "projects") created = await tx.projectTag.create({ data: { ...base, code: body.code?.trim() || null } })
      if (kind === "vendors") created = await tx.vendor.create({ data: { ...base, contactPerson: body.contactPerson, phone: body.phone, email: body.email, address: body.address, remarks: body.remarks } })
      if (created) await auditReferenceChange(tx, { userId: session.user.id, userName: session.user.name, action: "REFERENCE_DATA_CREATE", kind, record: created })
      return created
    })
    if (record) {
      return Response.json({ record }, { status: 201 })
    }
    return Response.json({ error: "Unknown reference-data kind" }, { status: 404 })
  } catch (error) { return apiError(error) }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "vault.reference.manage")) return forbiddenResponse()
  try {
    const { kind } = await context.params
    const body = await request.json()
    if (!body.id) return Response.json({ error: "ID is required" }, { status: 400 })
    const data = { name: body.name?.trim(), normalizedName: body.name ? normalizeName(body.name) : undefined, description: body.description, status: body.status }
    const record = await db.$transaction(async tx => {
      let updated: ({ id: string } & Record<string, unknown>) | null = null
      if (kind === "itemCategories") updated = await tx.itemCategory.update({ where: { id: body.id }, data: { ...data, discipline: body.discipline, parentId: body.parentId, sortOrder: body.sortOrder } })
      if (kind === "departments") updated = await tx.departmentTag.update({ where: { id: body.id }, data: { ...data, code: body.code } })
      if (kind === "projects") updated = await tx.projectTag.update({ where: { id: body.id }, data: { ...data, code: body.code } })
      if (kind === "vendors") updated = await tx.vendor.update({ where: { id: body.id }, data: { ...data, contactPerson: body.contactPerson, phone: body.phone, email: body.email, address: body.address, remarks: body.remarks } })
      if (updated) await auditReferenceChange(tx, { userId: session.user.id, userName: session.user.name, action: "REFERENCE_DATA_UPDATE", kind, record: updated })
      return updated
    })
    if (record) {
      return Response.json({ record })
    }
    return Response.json({ error: "Unknown reference-data kind" }, { status: 404 })
  } catch (error) { return apiError(error) }
}
