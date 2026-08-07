import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/inventory-items — List with pagination, search, filters
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view inventory items')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const search = searchParams.get('search') || ''
    const itemName = searchParams.get('itemName') || ''
    const warehouse = searchParams.get('warehouse') || ''
    const stockFilter = searchParams.get('stockFilter') || 'all'

    // Build where clause
    const where: Record<string, unknown> = { status: 'ACTIVE' }

    if (search) {
      where.OR = [
        { itemName: { contains: search } },
        { specification: { contains: search } },
      ]
    }

    if (itemName) {
      where.itemName = itemName
    }

    if (warehouse) {
      where.warehouse = warehouse
    }

    // Stock filters
    if (stockFilter === 'lowStock') {
      where.minimumStock = { gt: 0 }
      where.quantity = { gt: 0 }
    } else if (stockFilter === 'outOfStock') {
      where.quantity = 0
    } else if (stockFilter === 'reserved') {
      where.reservedQty = { gt: 0 }
    }

    // Fetch items and counts in parallel
    const [items, total, distinctItemNames, distinctWarehouses] = await Promise.all([
      db.inventoryItem.findMany({
        where,
        orderBy: [{ itemName: 'asc' }, { specification: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.inventoryItem.count({ where }),
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

    // Post-process: apply stock filters that need arithmetic comparison
    const filteredItems = items.filter((item) => {
      if (stockFilter === 'lowStock') {
        return item.minimumStock > 0 && item.quantity > 0 && item.quantity <= item.minimumStock
      }
      return true
    })

    // Calculate available stock for each item (never negative)
    const data = filteredItems.map((item) => ({
      ...item,
      availableStock: Math.max(0, item.quantity - item.issuedQty - item.reservedQty),
    }))

    return Response.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      itemNames: distinctItemNames.map((i) => i.itemName),
      warehouses: distinctWarehouses.map((w) => w.warehouse),
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

      // Validate required fields
      if (!item.itemName) {
        errors.push({
          index: i,
          itemName: item.itemName || '',
          specification: spec,
          warehouse: wh,
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
        // Check for unique constraint violation
        if (message.includes('Unique constraint')) {
          errors.push({
            index: i,
            itemName: item.itemName,
            specification: spec,
            warehouse: wh,
            error: `Duplicate item: "${item.itemName}" with spec "${spec}" in "${wh}" already exists`,
          })
        } else {
          errors.push({
            index: i,
            itemName: item.itemName,
            specification: spec,
            warehouse: wh,
            error: message,
          })
        }
      }
    }

    return Response.json({ created, errors }, { status: 201 })
  } catch (error) {
    console.error('POST /api/inventory-items error:', error)
    return Response.json({ error: 'Failed to create inventory items' }, { status: 500 })
  }
}
