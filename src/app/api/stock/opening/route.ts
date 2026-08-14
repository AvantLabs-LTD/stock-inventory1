import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── Stock Calculation Helper ──────────────────────────────────────────
// Inline helper to compute all per-product stock metrics

interface ProductStockMetrics {
  openingQuantity: number
  currentTotalStock: number
  reservedQuantity: number
  issuedQuantity: number
  returnedQuantity: number
  availableQuantity: number
  toBeUsed: number
  totalBatch: number
  required: number
  ordered: number
}

async function getProductStockMetrics(productIds: string[]) {
  // All transactions for the given products
  const allTransactions = await db.inventoryTransaction.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, type: true, quantity: true },
  })

  const txMap = new Map<string, { opening: number; received: number; issued: number; returned: number; adjIn: number; adjOut: number }>()
  for (const pid of productIds) {
    txMap.set(pid, { opening: 0, received: 0, issued: 0, returned: 0, adjIn: 0, adjOut: 0 })
  }
  for (const tx of allTransactions) {
    const e = txMap.get(tx.productId)
    if (!e) continue
    switch (tx.type) {
      case 'OPENING_STOCK': e.opening += tx.quantity; break
      case 'GOODS_RECEIVED': e.received += tx.quantity; break
      case 'ISSUED': e.issued += tx.quantity; break
      case 'RETURNED': e.returned += tx.quantity; break
      case 'ADJUSTMENT_IN': e.adjIn += tx.quantity; break
      case 'ADJUSTMENT_OUT': e.adjOut += tx.quantity; break
    }
  }

  // Reserved quantities (ACTIVE only)
  const reservations = await db.reservedInventory.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, status: 'ACTIVE' },
    _sum: { quantity: true },
  })
  const reservedMap = new Map(reservations.map((r) => [r.productId, r._sum.quantity || 0]))

  // Ordered = sum of APPROVED / PARTIAL_APPROVED / COMPLETED request quantities
  const orderRequests = await db.inventoryRequest.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, status: { in: ['APPROVED', 'PARTIAL_APPROVED', 'COMPLETED'] } },
    _sum: { quantity: true },
  })
  const orderedMap = new Map(orderRequests.map((r) => [r.productId, r._sum.quantity || 0]))

  // Total batch = count of OPENING_STOCK transactions per product
  const batchCountMap = new Map<string, number>()
  for (const pid of productIds) {
    batchCountMap.set(pid, 0)
  }
  for (const tx of allTransactions) {
    if (tx.type === 'OPENING_STOCK') {
      batchCountMap.set(tx.productId, (batchCountMap.get(tx.productId) || 0) + 1)
    }
  }

  const metricsMap = new Map<string, ProductStockMetrics>()
  for (const pid of productIds) {
    const tx = txMap.get(pid)!
    const reserved = reservedMap.get(pid) || 0
    const ordered = orderedMap.get(pid) || 0
    const totalBatch = batchCountMap.get(pid) || 0

    const currentTotalStock = tx.opening + tx.received + tx.returned + tx.adjIn - tx.issued - tx.adjOut
    const availableQuantity = currentTotalStock - reserved
    const toBeUsed = tx.issued + reserved
    const required = availableQuantity - toBeUsed

    metricsMap.set(pid, {
      openingQuantity: tx.opening,
      currentTotalStock,
      reservedQuantity: reserved,
      issuedQuantity: tx.issued,
      returnedQuantity: tx.returned,
      availableQuantity,
      toBeUsed,
      totalBatch,
      required,
      ordered,
    })
  }

  return metricsMap
}

// GET /api/stock/opening — List all opening stock entries with calculated fields
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view opening stock')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId') || ''

    const where: Record<string, unknown> = {
      type: 'OPENING_STOCK',
    }

    if (search) {
      where.product = {
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
          { sku: { contains: search } },
        ],
      }
    }

    // Filter by categoryId
    if (categoryId) {
      const existingProduct = where.product as Record<string, unknown> | undefined
      if (existingProduct) {
        existingProduct.categoryId = categoryId
      } else {
        where.product = { categoryId }
      }
    }

    const [entries, total] = await Promise.all([
      db.inventoryTransaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: {
            select: {
              id: true, name: true, code: true, sku: true, unit: true, status: true,
              image: true,
              category: { select: { id: true, name: true, code: true } },
              supplier: { select: { id: true, name: true } },
            },
          },
        },
      }),
      db.inventoryTransaction.count({ where }),
    ])

    if (entries.length === 0) {
      return Response.json({
        data: [],
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      })
    }

    // Collect unique product IDs and compute metrics
    const productIds = [...new Set(entries.map((e) => e.productId))]
    const metricsMap = await getProductStockMetrics(productIds)

    // Enrich entries with calculated fields
    const enrichedEntries = entries.map((entry) => {
      const metrics = metricsMap.get(entry.productId)
      return {
        ...entry,
        date: entry.date.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.createdAt.toISOString(),
        openingQuantity: entry.quantity,
        currentTotalStock: metrics?.currentTotalStock ?? 0,
        reservedQuantity: metrics?.reservedQuantity ?? 0,
        issuedQuantity: metrics?.issuedQuantity ?? 0,
        returnedQuantity: metrics?.returnedQuantity ?? 0,
        availableQuantity: metrics?.availableQuantity ?? 0,
        toBeUsed: metrics?.toBeUsed ?? 0,
        totalBatch: metrics?.totalBatch ?? 0,
        required: metrics?.required ?? 0,
        ordered: metrics?.ordered ?? 0,
        remarks: entry.remarks ?? '',
        itemImage: entry.product.image ?? null,
        receivedDate: entry.date.toISOString(),
      }
    })

    return Response.json({
      data: enrichedEntries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('GET /api/stock/opening error:', error)
    return Response.json({ error: 'Failed to fetch opening stock entries' }, { status: 500 })
  }
}


// POST /api/stock/opening — Set or update opening stock for a product
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can set opening stock')
    }

    const body = await request.json()
    const { productId, quantity, remarks } = body

    if (!productId || !quantity || quantity <= 0) {
      return Response.json(
        { error: 'productId and a positive quantity are required' },
        { status: 400 }
      )
    }

    // Verify product exists and is active
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, status: true },
    })
    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }
    if (product.status === 'DISCONTINUED') {
      return Response.json({ error: 'Cannot set opening stock for a discontinued product' }, { status: 400 })
    }

    // Check if opening stock already exists for this product — update instead of block
    const existingOpening = await db.inventoryTransaction.findFirst({
      where: { productId, type: 'OPENING_STOCK' },
    })

    let transaction
    let actionLabel: string

    if (existingOpening) {
      // Update existing opening stock entry
      const oldQuantity = existingOpening.quantity
      transaction = await db.inventoryTransaction.update({
        where: { id: existingOpening.id },
        data: { quantity, remarks: remarks || existingOpening.remarks || 'Opening stock entry' },
        include: {
          product: { select: { id: true, name: true, code: true } },
        },
      })
      actionLabel = `Updated opening stock for ${product.name} (${product.id}): ${oldQuantity} → ${quantity}`
    } else {
      // Create new opening stock entry
      transaction = await db.inventoryTransaction.create({
        data: {
          productId,
          type: 'OPENING_STOCK',
          quantity,
          remarks: remarks || 'Opening stock entry',
        },
        include: {
          product: { select: { id: true, name: true, code: true } },
        },
      })
      actionLabel = `Set opening stock for ${product.name} (${product.id}): quantity=${quantity}`
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: existingOpening ? 'OPENING_STOCK_UPDATED' : 'OPENING_STOCK_SET',
        entityType: 'Product',
        entityId: productId,
        details: actionLabel,
      },
    })

    return Response.json(transaction, { status: 201 })
  } catch (error) {
    console.error('POST /api/stock/opening error:', error)
    return Response.json({ error: 'Failed to set opening stock' }, { status: 500 })
  }
}
