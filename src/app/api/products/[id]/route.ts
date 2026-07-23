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
        supplier: { select: { id: true, name: true } },
        transactions: {
          select: { type: true, quantity: true },
        },
      },
    })

    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    // Calculate stock summary
    let totalStock = 0
    let reservedStock = 0
    let issuedStock = 0
    let returnedStock = 0

    for (const tx of product.transactions) {
      switch (tx.type) {
        case 'OPENING_STOCK':
        case 'GOODS_RECEIVED':
        case 'RETURNED':
        case 'ADJUSTMENT_IN':
          totalStock += tx.quantity
          break
        case 'ISSUED':
        case 'ADJUSTMENT_OUT':
          totalStock -= tx.quantity
          break
      }
      if (tx.type === 'ISSUED') issuedStock += tx.quantity
      if (tx.type === 'RETURNED') returnedStock += tx.quantity
    }

    // Count reservations
    const reservations = await db.reservedInventory.aggregate({
      _count: { id: true },
      _sum: { quantity: true },
      where: { productId: id, status: 'ACTIVE' },
    })
    reservedStock = reservations._sum.quantity || 0

    const availableStock = Math.max(0, totalStock - reservedStock)

    return Response.json({
      ...product,
      stockSummary: {
        total: totalStock,
        available: availableStock,
        reserved: reservedStock,
        issued: issuedStock,
        returned: returnedStock,
      },
    })
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
      categoryId,
      supplierId,
      manufacturer,
      modelNumber,
      unit,
      image,
      description,
      storageLocation,
      minimumStock,
      unitCost,
      status,
    } = body

    // Check if product exists
    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    // Check SKU uniqueness if changed
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
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
        ...(supplierId !== undefined && { supplierId: supplierId || null }),
        ...(manufacturer !== undefined && { manufacturer: manufacturer || null }),
        ...(modelNumber !== undefined && { modelNumber: modelNumber || null }),
        ...(unit && { unit }),
        ...(image !== undefined && { image: image || null }),
        ...(description !== undefined && { description: description || null }),
        ...(storageLocation !== undefined && { storageLocation: storageLocation || null }),
        ...(minimumStock !== undefined && { minimumStock }),
        ...(unitCost !== undefined && { unitCost }),
        ...(status && { status }),
      },
      include: {
        category: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true } },
      },
    })

    return Response.json(product)
  } catch (error) {
    console.error('PUT /api/products/[id] error:', error)
    return Response.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

// DELETE /api/products/[id] — Soft delete (set status to DISCONTINUED)
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

    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    const product = await db.product.update({
      where: { id },
      data: { status: 'DISCONTINUED' },
    })

    return Response.json(product)
  } catch (error) {
    console.error('DELETE /api/products/[id] error:', error)
    return Response.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
