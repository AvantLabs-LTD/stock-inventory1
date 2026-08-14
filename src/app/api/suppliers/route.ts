import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/suppliers — List with search, pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'suppliers', 'view')) {
      return forbiddenResponse('No permission to view suppliers')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { contactPerson: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    if (status) where.status = status

    const [suppliers, total] = await Promise.all([
      db.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { products: true } },
        },
      }),
      db.supplier.count({ where }),
    ])

    return Response.json({
      data: suppliers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('GET /api/suppliers error:', error)
    return Response.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
  }
}

// POST /api/suppliers — Create supplier
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'suppliers', 'create')) {
      return forbiddenResponse('No permission to create suppliers')
    }

    const body = await request.json()
    const { name, contactPerson, phone, email, address, notes, status } = body

    // Check unique name
    const existing = await db.supplier.findUnique({ where: { name } })
    if (existing) {
      return Response.json({ error: 'Supplier with this name already exists' }, { status: 409 })
    }

    const supplier = await db.supplier.create({
      data: {
        name,
        contactPerson: contactPerson || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        notes: notes || null,
        status: status || 'ACTIVE',
      },
      include: {
        _count: { select: { products: true } },
      },
    })

    return Response.json(supplier, { status: 201 })
  } catch (error) {
    console.error('POST /api/suppliers error:', error)
    return Response.json({ error: 'Failed to create supplier' }, { status: 500 })
  }
}
