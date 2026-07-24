import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/categories — List all
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'categories', 'view')) {
      return forbiddenResponse('No permission to view categories')
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
      ]
    }

    const categories = await db.category.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true, products: true } },
      },
      orderBy: { name: 'asc' },
    })

    return Response.json({ data: categories })
  } catch (error) {
    console.error('GET /api/categories error:', error)
    return Response.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

// POST /api/categories — Create category
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'categories', 'create')) {
      return forbiddenResponse('No permission to create categories')
    }

    const body = await request.json()
    const { name, description, parentId, status } = body

    // Auto-generate code: CAT-XXXX
    const count = await db.category.count()
    const code = `CAT-${String(count + 1).padStart(4, '0')}`

    const category = await db.category.create({
      data: {
        code,
        name,
        description: description || null,
        parentId: parentId || null,
        status: status || 'ACTIVE',
      },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true, products: true } },
      },
    })

    return Response.json(category, { status: 201 })
  } catch (error) {
    console.error('POST /api/categories error:', error)
    return Response.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
