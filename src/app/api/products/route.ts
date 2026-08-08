import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/products — List with search, filter, sort, pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'products', 'view')) {
      return forbiddenResponse('No permission to view products')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId') || ''
    const status = searchParams.get('status') || ''
    const sort = searchParams.get('sort') || 'createdAt'
    const order = searchParams.get('order') || 'desc'

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { sku: { contains: search } },
        { size: { contains: search } },
      ]
    }

    if (categoryId) where.categoryId = categoryId
    if (status) where.status = status

    const orderBy: Record<string, string> = { [sort]: order }

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { id: true, name: true, code: true } },
        },
      }),
      db.product.count({ where }),
    ])

    return Response.json({
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('GET /api/products error:', error)
    return Response.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

// POST /api/products — Create product and auto-sync to InventoryItem
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'products', 'create')) {
      return forbiddenResponse('No permission to create products')
    }

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
      specifications,
    } = body as {
      name: string
      sku: string
      size?: string
      categoryId?: string
      unit?: string
      minimumStock?: number
      unitCost?: number
      status?: string
      specifications?: { variantName: string; unit?: string; minimumStock?: number; unitCost?: number }[]
    }

    // Auto-generate code
    const count = await db.product.count()
    const code = `PRD-${String(count + 1).padStart(4, '0')}`

    // Verify SKU is unique
    const existingSku = await db.product.findUnique({ where: { sku } })
    if (existingSku) {
      return Response.json({ error: 'SKU already exists' }, { status: 409 })
    }

    const product = await db.product.create({
      data: {
        code,
        name,
        sku,
        size: size || null,
        categoryId: categoryId || null,
        unit: unit || 'pcs',
        minimumStock: minimumStock ?? 0,
        unitCost: unitCost ?? 0,
        status: status || 'ACTIVE',
      },
      include: {
        category: { select: { id: true, name: true, code: true } },
      },
    })

    // Auto-create InventoryItem for the parent product
    try {
      await db.inventoryItem.upsert({
        where: {
          itemName_specification_warehouse: {
            itemName: name,
            specification: '-',
            warehouse: 'Main Warehouse',
          },
        },
        create: {
          itemName: name,
          specification: '-',
          unit: unit || 'pcs',
          minimumStock: minimumStock ?? 0,
          unitCost: unitCost ?? 0,
          warehouse: 'Main Warehouse',
        },
        update: {},
      })
    } catch {
      // Non-critical: inventory sync is best-effort
    }

    // Auto-create variants if provided
    let createdVariants: unknown[] = []
    if (specifications && Array.isArray(specifications) && specifications.length > 0) {
      for (const spec of specifications) {
        if (!spec.variantName) continue

        const variantCode = `PRD-${String(count + 2 + createdVariants.length).padStart(4, '0')}`
        const variantSku = `SKU-${spec.variantName.toUpperCase().replace(/\s+/g, '_')}`

        const variant = await db.product.create({
          data: {
            code: variantCode,
            name: spec.variantName,
            sku: variantSku,
            parentProductId: product.id,
            variantName: spec.variantName,
            unit: spec.unit || unit || 'pcs',
            minimumStock: spec.minimumStock ?? minimumStock ?? 0,
            unitCost: spec.unitCost ?? unitCost ?? 0,
            status: 'ACTIVE',
          },
        })
        createdVariants.push(variant)

        // Auto-create InventoryItem for the variant
        try {
          await db.inventoryItem.upsert({
            where: {
              itemName_specification_warehouse: {
                itemName: name,
                specification: spec.variantName,
                warehouse: 'Main Warehouse',
              },
            },
            create: {
              itemName: name,
              specification: spec.variantName,
              unit: spec.unit || unit || 'pcs',
              minimumStock: spec.minimumStock ?? minimumStock ?? 0,
              unitCost: spec.unitCost ?? unitCost ?? 0,
              warehouse: 'Main Warehouse',
            },
            update: {},
          })
        } catch {
          // Non-critical
        }
      }
    }

    return Response.json({ ...product, variants: createdVariants }, { status: 201 })
  } catch (error) {
    console.error('POST /api/products error:', error)
    return Response.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
