import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifySessionToken, COOKIE_NAME, type SessionPayload } from '@/lib/auth'
import { db } from '@/lib/db'
import type { UserRole } from '@prisma/client'
import { verifyServiceToken } from '@/lib/service-tokens'

export interface AuthSession {
  credential: { type: 'session' } | { type: 'service_token'; id: string; name: string }
  user: {
    id: string
    email: string
    name: string
    status: string
    role: UserRole
    groups: Array<{ id: string; name: string }>
    permissions: string[]
  }
}

/**
 * Extract and verify the JWT session token from the request cookies.
 * Returns the authenticated user with their department info, or null if not authenticated.
 */
export async function getSession(request?: NextRequest): Promise<AuthSession | null> {
  try {
    const authorization = request?.headers.get('authorization')
    if (authorization) {
      if (!authorization.startsWith('Bearer ')) return null
      const record = await verifyServiceToken(authorization.slice(7).trim())
      if (!record) return null
      const livePermissions = new Set(record.user.accessGroups.flatMap(membership => membership.group.permissions.map(entry => entry.permissionKey)))
      return { credential: { type: 'service_token', id: record.id, name: record.name }, user: {
        id: record.user.id, email: record.user.email, name: record.user.name,
        status: record.user.status, role: record.user.role,
        groups: record.user.accessGroups.map(membership => ({ id: membership.group.id, name: membership.group.name })),
        permissions: record.scopes.filter(scope => livePermissions.has(scope)),
      } }
    }
    let token: string | undefined

    if (request) {
      // Try from request cookies first (for middleware usage)
      token = request.cookies.get(COOKIE_NAME)?.value
    }

    // Fallback to reading from next/headers cookies
    if (!token) {
      const cookieStore = await cookies()
      token = cookieStore.get(COOKIE_NAME)?.value
    }

    if (!token) return null

    const payload: SessionPayload | null = await verifySessionToken(token)
    if (!payload) return null

    // Fetch user from database to ensure they still exist and are active
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        role: true,
        accessGroups: { include: { group: { include: { permissions: { select: { permissionKey: true } } } } } },
      },
    })

    if (!user || user.status !== 'ACTIVE') return null

    return {
      credential: { type: 'session' },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        role: user.role,
        groups: user.accessGroups.map(membership => ({ id: membership.group.id, name: membership.group.name })),
        permissions: [...new Set(user.accessGroups.flatMap(membership => membership.group.permissions.map(entry => entry.permissionKey)))],
      },
    }
  } catch {
    return null
  }
}

/**
 * Helper to create a JSON 401 response.
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return Response.json({ error: message, code: 'UNAUTHORIZED' }, { status: 401 })
}

export function forbiddenResponse(message = 'You do not have permission to perform this action') {
  return Response.json({ error: message, code: 'FORBIDDEN' }, { status: 403 })
}

export function hasPermission(session: AuthSession, permission: string) {
  return session.user.permissions.includes(permission)
}
