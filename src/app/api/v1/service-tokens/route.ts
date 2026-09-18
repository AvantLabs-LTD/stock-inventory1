import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { issueServiceToken } from "@/lib/service-tokens"

const createSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.string().min(1)).min(1).max(50),
  expiresInDays: z.number().int().min(1).max(90),
}).strict()

async function administrator(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return { response: unauthorizedResponse() }
  if (session.credential.type !== "session" || !session.user.permissions.includes("flux.users.manage")) return { response: forbiddenResponse() }
  return { session }
}

export async function GET(request: NextRequest) {
  const auth = await administrator(request)
  if (auth.response) return auth.response
  const tokens = await db.serviceToken.findMany({ select: { id: true, userId: true, name: true, scopes: true, expiresAt: true, revokedAt: true, createdAt: true, lastUsedAt: true }, orderBy: { createdAt: "desc" }, take: 100 })
  return Response.json({ tokens })
}

export async function POST(request: NextRequest) {
  const auth = await administrator(request)
  if (auth.response) return auth.response
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT", error: parsed.error.issues.map(issue => issue.message).join("; ") }, { status: 400 })
  const { userId, name, expiresInDays } = parsed.data
  const scopes = [...new Set(parsed.data.scopes)]
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, status: true,
      accessGroups: { include: { group: { include: { permissions: { select: { permissionKey: true } } } } } },
    },
  })
  if (!user || user.status !== "ACTIVE") return Response.json({ code: "INVALID_USER", error: "Choose an active user" }, { status: 400 })
  const allowed = new Set(user.accessGroups.flatMap(membership => membership.group.permissions.map(entry => entry.permissionKey)))
  if (scopes.some(scope => !allowed.has(scope))) return Response.json({ code: "INVALID_SCOPE", error: "Token scopes must be permissions currently held by the user" }, { status: 400 })
  const credential = issueServiceToken()
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
  await db.$transaction(async tx => {
    await tx.serviceToken.create({ data: { id: credential.id, userId, name, scopes, tokenHash: credential.tokenHash, expiresAt } })
    await tx.auditLog.create({ data: { userId: auth.session!.user.id, userName: auth.session!.user.name, action: "SERVICE_TOKEN_CREATE", entityType: "ServiceToken", entityId: credential.id, details: JSON.stringify({ targetUserId: userId, name, scopes, expiresAt }) } })
  })
  return Response.json({ token: credential.plaintext, id: credential.id, name, userId, scopes, expiresAt }, { status: 201, headers: { "Cache-Control": "no-store" } })
}

export async function DELETE(request: NextRequest) {
  const auth = await administrator(request)
  if (auth.response) return auth.response
  const id = request.nextUrl.searchParams.get("id")
  if (!id) return Response.json({ code: "ID_REQUIRED", error: "Token ID required" }, { status: 400 })
  const token = await db.serviceToken.findUnique({ where: { id }, select: { id: true, revokedAt: true } })
  if (!token) return Response.json({ code: "NOT_FOUND", error: "Token not found" }, { status: 404 })
  if (!token.revokedAt) await db.$transaction(async tx => {
    await tx.serviceToken.update({ where: { id }, data: { revokedAt: new Date() } })
    await tx.auditLog.create({ data: { userId: auth.session!.user.id, userName: auth.session!.user.name, action: "SERVICE_TOKEN_REVOKE", entityType: "ServiceToken", entityId: id, details: "{}" } })
  })
  return Response.json({ id, revoked: true })
}
