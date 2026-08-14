import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/products/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'products', 'view')) {
      return forbiddenResponse('No permission to view products')
    }

    const { id } = await params

    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, code: true } },
        variants: {
          select: { id: true, name: true, variantName: true, status: true },
          orderBy: { name: 'asc' },
        },
      },
    })

    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    return Response.json(product)
  } catch (error) {
    console.error('GET /api/products/[id] error:', error)
    return Response.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}

// PUT /api/products/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'products', 'edit')) {
      return forbiddenResponse('No permission to edit products')
    }

    const { id } = await params
    const body = await request.json()
    const {
      name,
      sku,
      size,
      categoryId,
      unit,
      minimumStock,
      unitCost,
      status,
    } = body

    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    if (sku && sku !== existing.sku) {
      const existingSku = await db.product.findUnique({ where: { sku } })
      if (existingSku) {
        return Response.json({ error: 'SKU already exists' }, { status: 409 })
      }
    }

    const product = await db.product.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(sku && { sku }),
        ...(size !== undefined && { size: size || null }),
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
        ...(unit && { unit }),
        ...(minimumStock !== undefined && { minimumStock }),
        ...(unitCost !== undefined && { unitCost }),
        ...(status && { status }),
      },
      include: {
        category: { select: { id: true, name: true, code: true } },
      },
    })

    // Sync name change to InventoryItem
    if (name && name !== existing.name) {
      try {
        await db.inventoryItem.updateMany({
          where: { itemName: existing.name },
          data: { itemName: name },
        })
      } catch {
        // Non-critical
      }
    }

    return Response.json(product)
  } catch (error) {
    console.error('PUT /api/products/[id] error:', error)
    return Response.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

// DELETE /api/products/[id] — Delete product + variants + inventory items
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'products', 'delete')) {
      return forbiddenResponse('No permission to delete products')
    }

    const { id } = await params

    const existing = await db.product.findUnique({
      where: { id },
      include: { variants: { select: { id: true } } },
    })
    if (!existing) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    // Delete variant products
    if (existing.variants.length > 0) {
      await db.product.deleteMany({
        where: { parentProductId: existing.id },
      })
    }

    // Delete the parent product
    await db.product.delete({ where: { id } })

    // Delete all InventoryItems matching this product name
    try {
      await db.inventoryItem.deleteMany({
        where: { itemName: existing.name },
      })
    } catch {
      // Non-critical
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/products/[id] error:', error)
    return Response.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
