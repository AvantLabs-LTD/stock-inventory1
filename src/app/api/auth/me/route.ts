import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth-middleware'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)

    if (!session) {
      return unauthorizedResponse()
    }

    return NextResponse.json({ user: session.user })
  } catch (error) {
    console.error('Get current user error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
