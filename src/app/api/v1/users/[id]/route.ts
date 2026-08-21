import { NextRequest } from "next/server"
import { Prisma, UserRole } from "@prisma/client"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/auth"
import { forbiddenResponse, getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"

const roles = new Set<UserRole>(["SUPER_ADMIN", "INVENTORY_MANAGER", "PURCHASE_APPROVER", "USER"])

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (session.user.role !== "SUPER_ADMIN") return forbiddenResponse()
  try {
    const { id } = await context.params
    const body = await request.json()
    const name = body.name === undefined ? undefined : String(body.name).trim()
    const role = body.role === undefined ? undefined : body.role as UserRole
    const status = body.status === undefined ? undefined : String(body.status)
    const password = body.password === undefined || body.password === "" ? undefined : String(body.password)
    if (name !== undefined && !name) throw new DomainError("NAME_REQUIRED", "Name is required")
    if (role !== undefined && !roles.has(role)) throw new DomainError("INVALID_ROLE", "Select a valid role")
    if (status !== undefined && !["ACTIVE", "INACTIVE"].includes(status)) throw new DomainError("INVALID_STATUS", "Select a valid account status")
    if (password !== undefined && password.length < 12) throw new DomainError("WEAK_PASSWORD", "New password must contain at least 12 characters")
    const passwordHash = password ? await hashPassword(password) : undefined
    const user = await db.$transaction(async tx => {
      const existing = await tx.user.findUnique({ where: { id } })
      if (!existing) throw new DomainError("USER_NOT_FOUND", "User was not found", 404)
      const nextRole = role || existing.role, nextStatus = status || existing.status
      if (existing.id === session.user.id && (nextRole !== "SUPER_ADMIN" || nextStatus !== "ACTIVE")) {
        throw new DomainError("CANNOT_DISABLE_SELF", "You cannot remove your own Super Admin access")
      }
      if (existing.role === "SUPER_ADMIN" && existing.status === "ACTIVE" && (nextRole !== "SUPER_ADMIN" || nextStatus !== "ACTIVE")) {
        const activeSuperAdmins = await tx.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } })
        if (activeSuperAdmins <= 1) throw new DomainError("LAST_SUPER_ADMIN", "At least one active Super Admin must remain")
      }
      const updated = await tx.user.update({ where: { id }, data: {
        name, role, status, password: passwordHash,
      } })
      await tx.auditLog.create({ data: {
        userId: session.user.id, userName: session.user.name, action: "UPDATE_USER", entityType: "User", entityId: updated.id,
        details: JSON.stringify({ before: { name: existing.name, role: existing.role, status: existing.status }, after: { name: updated.name, role: updated.role, status: updated.status }, passwordReset: Boolean(password) }),
      } })
      return updated
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return Response.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, createdAt: user.createdAt, updatedAt: user.updatedAt } })
  } catch (error) { return apiError(error) }
}
