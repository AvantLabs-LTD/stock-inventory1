import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/categories/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'categories', 'view')) {
      return forbiddenResponse('No permission to view categories')
    }

    const { id } = await params

    const category = await db.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true, products: true } },
      },
    })

    if (!category) {
      return Response.json({ error: 'Category not found' }, { status: 404 })
    }

    return Response.json(category)
  } catch (error) {
    console.error('GET /api/categories/[id] error:', error)
    return Response.json({ error: 'Failed to fetch category' }, { status: 500 })
  }
}

// PUT /api/categories/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'categories', 'edit')) {
      return forbiddenResponse('No permission to edit categories')
    }

    const { id } = await params
    const body = await request.json()
    const { name, description, parentId, status } = body

    const existing = await db.category.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Category not found' }, { status: 404 })
    }

    // Prevent setting self as parent
    if (parentId === id) {
      return Response.json({ error: 'Cannot set category as its own parent' }, { status: 400 })
    }

    const category = await db.category.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(parentId !== undefined && { parentId: parentId || null }),
        ...(status && { status }),
      },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true, products: true } },
      },
    })

    return Response.json(category)
  } catch (error) {
    console.error('PUT /api/categories/[id] error:', error)
    return Response.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

// DELETE /api/categories/[id] — Delete (only if no children and no products)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'categories', 'delete')) {
      return forbiddenResponse('No permission to delete categories')
    }

    const { id } = await params

    const existing = await db.category.findUnique({
      where: { id },
      include: {
        _count: { select: { children: true, products: true } },
      },
    })

    if (!existing) {
      return Response.json({ error: 'Category not found' }, { status: 404 })
    }

    if (existing._count.children > 0) {
      return Response.json(
        { error: 'Cannot delete category with subcategories' },
        { status: 400 }
      )
    }

    if (existing._count.products > 0) {
      return Response.json(
        { error: 'Cannot delete category with products' },
        { status: 400 }
      )
    }

    await db.category.delete({ where: { id } })

    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/categories/[id] error:', error)
    return Response.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
