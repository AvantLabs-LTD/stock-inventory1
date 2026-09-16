import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { forbiddenResponse, getSession, hasPermission, unauthorizedResponse } from "@/lib/auth-middleware"

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session, "flux.users.manage")) return forbiddenResponse()
  const groups = await db.accessGroup.findMany({
    select: { id: true, name: true, description: true, isSystem: true,
      permissions: { select: { permissionKey: true } }, _count: { select: { users: true } } },
    orderBy: { name: "asc" },
  })
  return Response.json({ groups: groups.map(group => ({
    id: group.id, name: group.name, description: group.description, isSystem: group.isSystem,
    permissions: group.permissions.map(entry => entry.permissionKey), userCount: group._count.users,
  })) })
}
