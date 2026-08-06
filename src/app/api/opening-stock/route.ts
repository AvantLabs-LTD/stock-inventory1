import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── GET /api/opening-stock — List with pagination, filters, live stock ────
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view opening stock')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '25', 10)
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId') || ''
    const warehouse = searchParams.get('warehouse') || ''
    const status = searchParams.get('status') || 'ACTIVE'
    const stockStatus = searchParams.get('stockStatus') || ''
    const sortBy = searchParams.get('sortBy') || 'openingDate'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    // Build where clause
    const where: Record<string, unknown> = { status }

    if (search) {
      where.product = {
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
          { sku: { contains: search } },
          { barcode: { contains: search } },
          { modelNumber: { contains: search } },
        ],
      }
    }

    if (categoryId) {
      const existingProduct = where.product as Record<string, unknown> | undefined
      if (existingProduct && 'OR' in existingProduct) {
        existingProduct.categoryId = categoryId
      } else {
        where.product = { categoryId }
      }
    }

    if (warehouse) {
      where.warehouse = warehouse
    }

    // Valid sort fields
    const validSortFields = [
      'openingDate', 'quantity', 'unitCost', 'inventoryValue',
      'currentStock', 'availableStock', 'createdAt', 'updatedAt',
      'product.name', 'product.code',
    ]
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'openingDate'
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc'

    // Build orderBy
    let orderBy: Record<string, unknown>
    if (sortField.startsWith('product.')) {
      orderBy = { product: { [sortField.replace('product.', '')]: sortDirection } }
    } else {
      orderBy = { [sortField]: sortDirection }
    }

    const [entries, total] = await Promise.all([
      db.openingStock.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: {
            select: {
              id: true, name: true, code: true, sku: true, unit: true, status: true,
              barcode: true, brand: true, size: true, length: true, color: true,
              minimumStock: true, maximumStock: true, reorderLevel: true,
              parentProductId: true, variantName: true,
              category: { select: { id: true, name: true, code: true } },
              supplier: { select: { id: true, name: true } },
              parent: { select: { id: true, name: true, code: true } },
            },
          },
          supplier: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          projectQtys: {
            include: {
              projectField: { select: { id: true, name: true, code: true } },
            },
          },
          customValues: {
            include: {
              customField: { select: { id: true, name: true, fieldType: true } },
            },
          },
        },
      }),
      db.openingStock.count({ where }),
    ])

    // Get all project fields for dynamic response
    const projectFields = await db.projectField.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    })

    // Enrich with computed stock status
    const enrichedEntries = entries.map((entry) => {
      const product = entry.product
      const computedStockStatus = computeStockStatus(
        entry.currentStock,
        product.minimumStock,
        product.reorderLevel
      )

      return {
        ...entry,
        openingDate: entry.openingDate.toISOString(),
        expiryDate: entry.expiryDate?.toISOString() ?? null,
        receivedDate: entry.receivedDate?.toISOString() ?? null,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
        deletedAt: entry.deletedAt?.toISOString() ?? null,
        lastTransactionAt: entry.lastTransactionAt?.toISOString() ?? null,
        stockStatus: computedStockStatus,
      }
    })

    // Filter by stockStatus if requested (done in-memory since it's computed)
    const filteredEntries = stockStatus
      ? enrichedEntries.filter((e) => e.stockStatus === stockStatus)
      : enrichedEntries

    return Response.json({
      data: filteredEntries,
      projectFields,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('GET /api/opening-stock error:', error)
    return Response.json({ error: 'Failed to fetch opening stock entries' }, { status: 500 })
  }
}

// ─── POST /api/opening-stock — Create opening stock ──────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can create opening stock')
    }

    const body = await request.json()
    const {
      productId, quantity, unitCost, warehouse, storageLocation,
      batchNumber, serialNumber, expiryDate, supplierId,
      purchaseReference, invoiceNumber, receivedDate, openingDate,
      remarks, internalNotes, importBatchId, projectQtys,
    } = body

    if (!productId) {
      return Response.json({ error: 'productId is required' }, { status: 400 })
    }

    if (!quantity || typeof quantity !== 'number' || quantity <= 0) {
      return Response.json({ error: 'A positive quantity is required' }, { status: 400 })
    }

    // Handle inline product creation
    let resolvedProductId = productId
    if (productId === 'CREATE_NEW' && body.productData) {
      const productData = body.productData

      if (!productData.name || !productData.name.trim()) {
        return Response.json({ error: 'productData.name is required for inline creation' }, { status: 400 })
      }

      // Auto-generate code and SKU
      const code = `PRD-${Date.now().toString(36).toUpperCase()}`
      const sku = `SKU-${productData.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)}-${Date.now().toString(36).toUpperCase().slice(-4)}`

      // Check for unique code/sku
      let uniqueCode = code
      let codeExists = await db.product.findUnique({ where: { code: uniqueCode } })
      let attempt = 0
      while (codeExists && attempt < 10) {
        attempt++
        uniqueCode = `${code}-${attempt}`
        codeExists = await db.product.findUnique({ where: { code: uniqueCode } })
      }

      let uniqueSku = sku
      let skuExists = await db.product.findUnique({ where: { sku: uniqueSku } })
      attempt = 0
      while (skuExists && attempt < 10) {
        attempt++
        uniqueSku = `${sku}-${attempt}`
        skuExists = await db.product.findUnique({ where: { sku: uniqueSku } })
      }

      const newProduct = await db.product.create({
        data: {
          name: productData.name.trim(),
          code: uniqueCode,
          sku: uniqueSku,
          unit: productData.unit || 'pcs',
          categoryId: productData.categoryId || null,
          supplierId: productData.supplierId || null,
          manufacturer: productData.manufacturer || null,
          modelNumber: productData.modelNumber || null,
          brand: productData.brand || null,
          barcode: productData.barcode || null,
          size: productData.size || null,
          length: productData.length || null,
          color: productData.color || null,
          minimumStock: productData.minimumStock || 0,
          maximumStock: productData.maximumStock || 0,
          reorderLevel: productData.reorderLevel || 0,
          unitCost: productData.unitCost || 0,
          parentProductId: productData.parentProductId || null,
          variantName: productData.variantName || null,
          description: productData.description || null,
          storageLocation: productData.storageLocation || null,
          status: 'ACTIVE',
        },
      })
      resolvedProductId = newProduct.id
    }

    // Verify product exists
    const product = await db.product.findUnique({
      where: { id: resolvedProductId },
      select: { id: true, name: true, status: true, parentProductId: true },
    })
    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    // Check duplicate: same product + warehouse + status not DELETED
    const existing = await db.openingStock.findFirst({
      where: {
        productId: resolvedProductId,
        warehouse: warehouse || null,
        status: { not: 'DELETED' },
      },
    })
    if (existing) {
      return Response.json({
        error: 'An active opening stock already exists for this product in this warehouse',
        existingId: existing.id,
      }, { status: 409 })
    }

    const inventoryValue = (unitCost || 0) * quantity

    // Create opening stock + ledger entry in transaction
    const openingStock = await db.$transaction(async (tx) => {
      const stock = await tx.openingStock.create({
        data: {
          productId: resolvedProductId,
          warehouse: warehouse || null,
          storageLocation: storageLocation || null,
          quantity,
          unitCost: unitCost || 0,
          inventoryValue,
          batchNumber: batchNumber || null,
          serialNumber: serialNumber || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          supplierId: supplierId || null,
          purchaseReference: purchaseReference || null,
          invoiceNumber: invoiceNumber || null,
          receivedDate: receivedDate ? new Date(receivedDate) : null,
          openingDate: openingDate ? new Date(openingDate) : new Date(),
          remarks: remarks || null,
          internalNotes: internalNotes || null,
          importBatchId: importBatchId || null,
          createdById: session.user.id,
          currentStock: quantity,
          availableStock: quantity,
          lastTransactionAt: new Date(),
          status: 'ACTIVE',
        },
        include: {
          product: {
            select: {
              id: true, name: true, code: true, sku: true, unit: true,
              category: { select: { id: true, name: true, code: true } },
              supplier: { select: { id: true, name: true } },
              parent: { select: { id: true, name: true, code: true } },
            },
          },
          supplier: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      })

      // Create ledger entry
      await tx.stockLedger.create({
        data: {
          openingStockId: stock.id,
          transactionType: 'OPENING',
          quantity,
          oldStock: 0,
          newStock: quantity,
          userId: session.user.id,
          warehouse: warehouse || null,
          remarks: remarks || 'Opening stock entry',
        },
      })

      // Create project quantity entries if provided
      if (projectQtys && Array.isArray(projectQtys) && projectQtys.length > 0) {
        for (const pq of projectQtys) {
          if (!pq.projectFieldId || !pq.requiredQty) continue
          await tx.productProjectQty.upsert({
            where: {
              productId_projectFieldId: {
                productId: resolvedProductId,
                projectFieldId: pq.projectFieldId,
              },
            },
            create: {
              productId: resolvedProductId,
              projectFieldId: pq.projectFieldId,
              requiredQty: pq.requiredQty || 0,
              batchQty: pq.batchQty || 0,
              reservedQty: pq.reservedQty || 0,
              consumedQty: pq.consumedQty || 0,
              orderedQty: pq.orderedQty || 0,
              toBeUsed: pq.toBeUsed || 0,
              remarks: pq.remarks || null,
            },
            update: {
              requiredQty: pq.requiredQty || 0,
              batchQty: pq.batchQty || 0,
              reservedQty: pq.reservedQty || 0,
              consumedQty: pq.consumedQty || 0,
              orderedQty: pq.orderedQty || 0,
              toBeUsed: pq.toBeUsed || 0,
              remarks: pq.remarks || null,
            },
          })
        }
      }

      return stock
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'OPENING_STOCK_CREATED',
        entityType: 'OpeningStock',
        entityId: openingStock.id,
        details: `Created opening stock for ${product.name}: qty=${quantity}, cost=${unitCost || 0}`,
      },
    })

    return Response.json({
      ...openingStock,
      openingDate: openingStock.openingDate.toISOString(),
      expiryDate: openingStock.expiryDate?.toISOString() ?? null,
      receivedDate: openingStock.receivedDate?.toISOString() ?? null,
      createdAt: openingStock.createdAt.toISOString(),
      updatedAt: openingStock.updatedAt.toISOString(),
      lastTransactionAt: openingStock.lastTransactionAt?.toISOString() ?? null,
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/opening-stock error:', error)
    return Response.json({ error: 'Failed to create opening stock' }, { status: 500 })
  }
}

// ─── Stock Status Computation ─────────────────────────────────────────────
function computeStockStatus(
  currentStock: number,
  minimumStock: number,
  reorderLevel: number
): string {
  if (currentStock <= 0) return 'OUT_OF_STOCK'
  if (currentStock <= minimumStock) return 'CRITICAL'
  if (currentStock <= reorderLevel) return 'LOW'
  return 'HEALTHY'
}
