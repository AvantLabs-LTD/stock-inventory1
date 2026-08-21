import { NextRequest } from "next/server"
import { UserRole } from "@prisma/client"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/auth"
import { forbiddenResponse, getSession, unauthorizedResponse } from "@/lib/auth-middleware"
import { apiError, DomainError } from "@/lib/inventory-service"

const roles = new Set<UserRole>(["SUPER_ADMIN", "INVENTORY_MANAGER", "PURCHASE_APPROVER", "USER"])

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (session.user.role !== "SUPER_ADMIN") return forbiddenResponse()
  const users = await db.user.findMany({
    select: { id: true, email: true, name: true, role: true, status: true, createdAt: true, updatedAt: true },
    orderBy: [{ status: "asc" }, { name: "asc" }, { email: "asc" }],
  })
  return Response.json({ users })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (session.user.role !== "SUPER_ADMIN") return forbiddenResponse()
  try {
    const body = await request.json()
    const email = String(body.email || "").trim().toLowerCase()
    const name = String(body.name || "").trim()
    const password = String(body.password || "")
    const role = body.role as UserRole
    if (!email || !email.includes("@")) throw new DomainError("INVALID_EMAIL", "Enter a valid email address")
    if (!name) throw new DomainError("NAME_REQUIRED", "Name is required")
    if (password.length < 12) throw new DomainError("WEAK_PASSWORD", "Temporary password must contain at least 12 characters")
    if (!roles.has(role)) throw new DomainError("INVALID_ROLE", "Select a valid role")
    if (await db.user.findUnique({ where: { email } })) throw new DomainError("EMAIL_IN_USE", "A user with this email already exists", 409)
    const passwordHash = await hashPassword(password)
    const user = await db.$transaction(async tx => {
      const created = await tx.user.create({ data: { email, name, password: passwordHash, role, status: "ACTIVE" } })
      await tx.auditLog.create({ data: {
        userId: session.user.id, userName: session.user.name, action: "CREATE_USER", entityType: "User", entityId: created.id,
        details: JSON.stringify({ email: created.email, name: created.name, role: created.role, status: created.status }),
      } })
      return created
    })
    return Response.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, createdAt: user.createdAt, updatedAt: user.updatedAt } }, { status: 201 })
  } catch (error) { return apiError(error) }
}
