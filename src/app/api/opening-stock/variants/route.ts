import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── GET /api/opening-stock/variants — List variants of a parent product ────
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view product variants')
    }

    const { searchParams } = new URL(request.url)
    const parentProductId = searchParams.get('parentProductId') || ''

    if (!parentProductId) {
      return Response.json({ error: 'parentProductId query parameter is required' }, { status: 400 })
    }

    // Verify parent exists
    const parent = await db.product.findUnique({
      where: { id: parentProductId },
      select: {
        id: true,
        name: true,
        code: true,
        sku: true,
        unit: true,
        category: { select: { id: true, name: true } },
      },
    })

    if (!parent) {
      return Response.json({ error: 'Parent product not found' }, { status: 404 })
    }

    // Get variants
    const variants = await db.product.findMany({
      where: { parentProductId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        sku: true,
        unit: true,
        variantName: true,
        barcode: true,
        brand: true,
        size: true,
        length: true,
        color: true,
        minimumStock: true,
        maximumStock: true,
        reorderLevel: true,
        unitCost: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Get opening stock for each variant
    const variantIds = variants.map((v) => v.id)
    const stocks = await db.openingStock.findMany({
      where: {
        productId: { in: variantIds },
        status: 'ACTIVE',
      },
      select: {
        productId: true,
        currentStock: true,
        availableStock: true,
        warehouse: true,
      },
    })

    const stockMap = new Map<string, { currentStock: number; availableStock: number; warehouse: string }>()
    for (const stock of stocks) {
      stockMap.set(stock.productId, {
        currentStock: stock.currentStock,
        availableStock: stock.availableStock,
        warehouse: stock.warehouse || '',
      })
    }

    const enrichedVariants = variants.map((v) => ({
      ...v,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
      stock: stockMap.get(v.id) || { currentStock: 0, availableStock: 0, warehouse: '' },
    }))

    return Response.json({
      parent,
      variants: enrichedVariants,
    })
  } catch (error) {
    console.error('GET /api/opening-stock/variants error:', error)
    return Response.json({ error: 'Failed to fetch product variants' }, { status: 500 })
  }
}
