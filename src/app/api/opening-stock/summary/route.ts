import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── GET /api/opening-stock/summary — Dashboard summary stats ──────────────
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view opening stock summary')
    }

    // Fetch all ACTIVE opening stock entries
    const activeStocks = await db.openingStock.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        quantity: true,
        unitCost: true,
        inventoryValue: true,
        currentStock: true,
        product: {
          select: {
            minimumStock: true,
            reorderLevel: true,
            categoryId: true,
          },
        },
        warehouse: true,
        createdAt: true,
      },
    })

    // Total products count (unique)
    const uniqueProductIds = new Set(activeStocks.map((s) => s.productId))
    const totalProducts = uniqueProductIds.size

    // Total quantity and value
    let totalQuantity = 0
    let totalValue = 0
    let lowStockCount = 0
    let outOfStockCount = 0
    let criticalStockCount = 0

    for (const stock of activeStocks) {
      totalQuantity += stock.currentStock
      totalValue += stock.inventoryValue

      const currentStock = stock.currentStock
      const minStock = stock.product.minimumStock || 0
      const reorderLevel = stock.product.reorderLevel || 0

      if (currentStock <= 0) {
        outOfStockCount++
      } else if (currentStock <= minStock) {
        criticalStockCount++
      } else if (currentStock <= reorderLevel) {
        lowStockCount++
      }
    }

    // Unique categories count
    const uniqueCategories = new Set(
      activeStocks
        .map((s) => s.product.categoryId)
        .filter(Boolean)
    )

    // Unique warehouses count
    const uniqueWarehouses = new Set(
      activeStocks
        .map((s) => s.warehouse)
        .filter(Boolean)
    )

    // Last import date
    const lastImport = await db.importBatch.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })

    return Response.json({
      totalProducts,
      totalQuantity,
      totalValue: Math.round(totalValue * 100) / 100,
      lowStockCount,
      outOfStockCount,
      criticalStockCount,
      categoriesCount: uniqueCategories.size,
      warehousesCount: uniqueWarehouses.size,
      lastImportDate: lastImport ? lastImport.createdAt.toISOString() : null,
    })
  } catch (error) {
    console.error('GET /api/opening-stock/summary error:', error)
    return Response.json({ error: 'Failed to fetch opening stock summary' }, { status: 500 })
  }
}
