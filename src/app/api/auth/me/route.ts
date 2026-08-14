import { NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth-middleware'

export async function GET() {
  try {
    const session = await getSession()

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
