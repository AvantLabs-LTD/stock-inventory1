import { NextRequest } from "next/server"
import { Prisma, UserRole } from "@prisma/client"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/auth"
import { forbiddenResponse, getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"
import { DEFAULT_GROUP_FOR_ROLE, legacyRoleForGroups } from "@/lib/access-groups"

const roles = new Set<UserRole>(["SUPER_ADMIN", "INVENTORY_MANAGER", "PURCHASE_APPROVER", "USER"])

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!session.user.permissions.includes("flux.users.manage")) return forbiddenResponse()
  try {
    const { id } = await context.params
    const body = await request.json()
    const name = body.name === undefined ? undefined : String(body.name).trim()
    const role = body.role === undefined ? undefined : body.role as UserRole
    const groupIds: string[] | undefined = Array.isArray(body.groupIds) ? [...new Set(body.groupIds)] as string[] : role ? [DEFAULT_GROUP_FOR_ROLE[role]] : undefined
    const status = body.status === undefined ? undefined : String(body.status)
    const password = body.password === undefined || body.password === "" ? undefined : String(body.password)
    if (name !== undefined && !name) throw new DomainError("NAME_REQUIRED", "Name is required")
    if (role !== undefined && !roles.has(role)) throw new DomainError("INVALID_ROLE", "Select a valid role")
    if (groupIds && (!groupIds.length || groupIds.some(groupId => typeof groupId !== "string"))) throw new DomainError("GROUP_REQUIRED", "Select at least one access group")
    if (groupIds && await db.accessGroup.count({ where: { id: { in: groupIds } } }) !== groupIds.length) throw new DomainError("INVALID_GROUP", "An access group was not found")
    if (status !== undefined && !["ACTIVE", "INACTIVE"].includes(status)) throw new DomainError("INVALID_STATUS", "Select a valid account status")
    if (password !== undefined && password.length < 12) throw new DomainError("WEAK_PASSWORD", "New password must contain at least 12 characters")
    const passwordHash = password ? await hashPassword(password) : undefined
    const user = await db.$transaction(async tx => {
      const existing = await tx.user.findUnique({ where: { id }, include: { accessGroups: true } })
      if (!existing) throw new DomainError("USER_NOT_FOUND", "User was not found", 404)
      const nextGroupIds = groupIds || existing.accessGroups.map(entry => entry.groupId)
      const nextRole = legacyRoleForGroups(nextGroupIds), nextStatus = status || existing.status
      if (existing.id === session.user.id && (!nextGroupIds.includes("flux_admin") || nextStatus !== "ACTIVE")) {
        throw new DomainError("CANNOT_DISABLE_SELF", "You cannot remove your own Super Admin access")
      }
      if (existing.accessGroups.some(entry => entry.groupId === "flux_admin") && existing.status === "ACTIVE" && (nextRole !== "SUPER_ADMIN" || nextStatus !== "ACTIVE")) {
        const activeSuperAdmins = await tx.user.count({ where: { accessGroups: { some: { groupId: "flux_admin" } }, status: "ACTIVE" } })
        if (activeSuperAdmins <= 1) throw new DomainError("LAST_SUPER_ADMIN", "At least one active Super Admin must remain")
      }
      const updated = await tx.user.update({ where: { id }, data: {
        name, role: nextRole, status, password: passwordHash,
        accessGroups: groupIds ? { deleteMany: {}, create: groupIds.map(groupId => ({ groupId })) } : undefined,
      } })
      await tx.auditLog.create({ data: {
        userId: session.user.id, userName: session.user.name, action: "UPDATE_USER", entityType: "User", entityId: updated.id,
        details: JSON.stringify({ before: { name: existing.name, groupIds: existing.accessGroups.map(entry => entry.groupId), status: existing.status }, after: { name: updated.name, groupIds: nextGroupIds, status: updated.status }, passwordReset: Boolean(password) }),
      } })
      return updated
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return Response.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, groupIds, status: user.status, createdAt: user.createdAt, updatedAt: user.updatedAt } })
  } catch (error) { return apiError(error) }
}
