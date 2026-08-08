import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── Types ──────────────────────────────────────────────────────────────

interface SpecData {
  id: string
  specification: string
  unit: string
  quantity: number
  issuedQty: number
  reservedQty: number
  returnedQty: number
  damagedQty: number
  availableStock: number
  minimumStock: number
  unitCost: number
  warehouse: string
  status: string
  remarks: string | null
}

interface ItemGroup {
  itemName: string
  specCount: number
  totalInventory: number
  totalIssued: number
  totalAvailable: number
  totalReserved: number
  specs: SpecData[]
}

// GET /api/inventory-items — List grouped by item name with pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view inventory items')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const search = searchParams.get('search') || ''
    const itemNameFilter = searchParams.get('itemName') || ''
    const warehouse = searchParams.get('warehouse') || ''
    const stockFilter = searchParams.get('stockFilter') || 'all'
    const expandAll = searchParams.get('expandAll') === 'true'

    // Build where clause for specs
    const where: Record<string, unknown> = { status: 'ACTIVE' }

    if (search) {
      where.OR = [
        { itemName: { contains: search } },
        { specification: { contains: search } },
      ]
    }

    if (itemNameFilter) {
      where.itemName = itemNameFilter
    }

    if (warehouse) {
      where.warehouse = warehouse
    }

    // Fetch ALL matching specs (grouping happens after)
    const allSpecs = await db.inventoryItem.findMany({
      where,
      orderBy: [{ itemName: 'asc' }, { specification: 'asc' }],
    })

    // Apply stock filters (need arithmetic)
    const filteredSpecs = allSpecs.filter((item) => {
      if (stockFilter === 'lowStock') {
        return item.minimumStock > 0 && item.quantity > 0 && item.quantity <= item.minimumStock
      }
      if (stockFilter === 'outOfStock') {
        return item.quantity === 0
      }
      if (stockFilter === 'reserved') {
        return item.reservedQty > 0
      }
      return true
    })

    // Group by itemName
    const groupMap = new Map<string, SpecData[]>()
    for (const spec of filteredSpecs) {
      const available = Math.max(0, spec.quantity - spec.issuedQty - spec.reservedQty)
      const specData: SpecData = {
        id: spec.id,
        specification: spec.specification,
        unit: spec.unit,
        quantity: spec.quantity,
        issuedQty: spec.issuedQty,
        reservedQty: spec.reservedQty,
        returnedQty: spec.returnedQty || 0,
        damagedQty: spec.damagedQty || 0,
        availableStock: available,
        minimumStock: spec.minimumStock,
        unitCost: spec.unitCost,
        warehouse: spec.warehouse,
        status: spec.status,
        remarks: spec.remarks || null,
      }
      const existing = groupMap.get(spec.itemName)
      if (existing) {
        existing.push(specData)
      } else {
        groupMap.set(spec.itemName, [specData])
      }
    }

    // Sort groups alphabetically
    const sortedGroups: ItemGroup[] = Array.from(groupMap.entries())
      .map(([itemName, specs]) => {
        const totalInventory = specs.reduce((sum, s) => sum + s.quantity, 0)
        const totalIssued = specs.reduce((sum, s) => sum + s.issuedQty, 0)
        const totalAvailable = specs.reduce((sum, s) => sum + s.availableStock, 0)
        const totalReserved = specs.reduce((sum, s) => sum + s.reservedQty, 0)
        return {
          itemName,
          specCount: specs.length,
          totalInventory,
          totalIssued,
          totalAvailable,
          totalReserved,
          specs,
        }
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName))

    // Pagination at group level
    const totalGroups = sortedGroups.length
    const totalPages = limit >= totalGroups ? 1 : Math.ceil(totalGroups / limit)
    const startIdx = (page - 1) * limit
    const paginatedGroups = limit >= totalGroups
      ? sortedGroups
      : sortedGroups.slice(startIdx, startIdx + limit)

    // Fetch distinct item names and warehouses for filters
    const [distinctItemNames, distinctWarehouses] = await Promise.all([
      db.inventoryItem.findMany({
        where: { status: 'ACTIVE' },
        select: { itemName: true },
        distinct: ['itemName'],
        orderBy: { itemName: 'asc' },
      }),
      db.inventoryItem.findMany({
        where: { status: 'ACTIVE' },
        select: { warehouse: true },
        distinct: ['warehouse'],
        orderBy: { warehouse: 'asc' },
      }),
    ])

    // Summary stats
    const allSpecsForSummary = await db.inventoryItem.findMany({
      where: { status: 'ACTIVE' },
    })
    const summary = {
      totalItems: new Set(allSpecsForSummary.map((s) => s.itemName)).size,
      totalSpecs: allSpecsForSummary.length,
      totalInventory: allSpecsForSummary.reduce((sum, s) => sum + s.quantity, 0),
      totalAvailable: allSpecsForSummary.reduce((sum, s) => sum + Math.max(0, s.quantity - s.issuedQty - s.reservedQty), 0),
      lowStockCount: allSpecsForSummary.filter((s) => s.minimumStock > 0 && s.quantity > 0 && s.quantity <= s.minimumStock).length,
      outOfStockCount: allSpecsForSummary.filter((s) => s.quantity === 0).length,
      reservedCount: allSpecsForSummary.filter((s) => s.reservedQty > 0).length,
    }

    return Response.json({
      data: paginatedGroups,
      pagination: { page, limit, total: totalGroups, totalPages },
      itemNames: distinctItemNames.map((i) => i.itemName),
      warehouses: distinctWarehouses.map((w) => w.warehouse),
      summary,
    })
  } catch (error) {
    console.error('GET /api/inventory-items error:', error)
    return Response.json({ error: 'Failed to fetch inventory items' }, { status: 500 })
  }
}

// POST /api/inventory-items — Create inventory items (bulk or single)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('No permission to manage inventory items')
    }

    const body = await request.json()
    const { items } = body as {
      items: {
        itemName: string
        specification: string
        unit?: string
        quantity?: number
        minimumStock?: number
        unitCost?: number
        warehouse?: string
      }[]
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'Items array is required' }, { status: 400 })
    }

    const created: unknown[] = []
    const errors: { index: number; itemName: string; specification: string; warehouse: string; error: string }[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const wh = item.warehouse || 'Main Warehouse'
      const spec = item.specification || ''

      if (!item.itemName) {
        errors.push({
          index: i, itemName: item.itemName || '', specification: spec, warehouse: wh,
          error: 'Item name is required',
        })
        continue
      }

      try {
        const createdItem = await db.inventoryItem.create({
          data: {
            itemName: item.itemName,
            specification: spec,
            unit: item.unit || 'pcs',
            quantity: item.quantity ?? 0,
            minimumStock: item.minimumStock ?? 0,
            unitCost: item.unitCost ?? 0,
            warehouse: wh,
          },
        })
        created.push(createdItem)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('Unique constraint')) {
          errors.push({
            index: i, itemName: item.itemName, specification: spec, warehouse: wh,
            error: `Duplicate: "${item.itemName}" with spec "${spec}" in "${wh}" already exists`,
          })
        } else {
          errors.push({ index: i, itemName: item.itemName, specification: spec, warehouse: wh, error: message })
        }
      }
    }

    return Response.json({ created, errors }, { status: 201 })
  } catch (error) {
    console.error('POST /api/inventory-items error:', error)
    return Response.json({ error: 'Failed to create inventory items' }, { status: 500 })
  }
}
