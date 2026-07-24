import { NextRequest } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth-middleware'

// POST /api/notifications/[id]/read — Mark notification as read
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    // Notifications are generated dynamically, so "marking as read" is handled client-side
    // This endpoint exists for API completeness and future persistence
    const { id } = await params

    return Response.json({ success: true, id })
  } catch (error) {
    console.error('POST /api/notifications/[id]/read error:', error)
    return Response.json({ error: 'Failed to mark notification as read' }, { status: 500 })
  }
}
