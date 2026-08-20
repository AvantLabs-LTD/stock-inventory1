import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifySessionToken, COOKIE_NAME, type SessionPayload } from '@/lib/auth'
import { db } from '@/lib/db'

export interface AuthSession {
  user: {
    id: string
    email: string
    name: string
    status: string
  }
}

/**
 * Extract and verify the JWT session token from the request cookies.
 * Returns the authenticated user with their department info, or null if not authenticated.
 */
export async function getSession(request?: NextRequest): Promise<AuthSession | null> {
  try {
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
      },
    })

    if (!user || user.status !== 'ACTIVE') return null

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
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
  return Response.json({ error: message }, { status: 401 })
}
