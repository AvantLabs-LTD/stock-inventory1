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

// POST /api/products — Create product
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
    } = body

    // Auto-generate code: PRD-XXXX
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

    return Response.json(product, { status: 201 })
  } catch (error) {
    console.error('POST /api/products error:', error)
    return Response.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
