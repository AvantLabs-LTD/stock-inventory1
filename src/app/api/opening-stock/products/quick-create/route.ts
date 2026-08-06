import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── POST /api/opening-stock/products/quick-create — Quick create a product ──
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can create products')
    }

    const body = await request.json()
    const { name, code, sku, unit, categoryId, supplierId, manufacturer, modelNumber, brand, barcode, qrCode, size, length, color, minimumStock, maximumStock, reorderLevel, unitCost, parentProductId, variantName, description, storageLocation } = body

    if (!name || !name.trim()) {
      return Response.json({ error: 'Product name is required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Auto-generate code if not provided
    let finalCode = code?.trim()
    if (!finalCode) {
      finalCode = `PRD-${Date.now().toString(36).toUpperCase()}`
    }

    // Auto-generate SKU if not provided
    let finalSku = sku?.trim()
    if (!finalSku) {
      finalSku = `SKU-${trimmedName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)}-${Date.now().toString(36).toUpperCase().slice(-4)}`
    }

    // Validate parent product if creating a variant
    if (parentProductId) {
      const parent = await db.product.findUnique({
        where: { id: parentProductId },
        select: { id: true, name: true, parentProductId: true },
      })
      if (!parent) {
        return Response.json({ error: 'Parent product not found' }, { status: 404 })
      }
      if (parent.parentProductId) {
        return Response.json({ error: 'Cannot create a variant of a variant (only one level deep)' }, { status: 400 })
      }
    }

    // Check unique code
    let uniqueCode = finalCode
    let codeExists = await db.product.findUnique({ where: { code: uniqueCode } })
    let attempt = 0
    while (codeExists && attempt < 10) {
      attempt++
      uniqueCode = `${finalCode}-${attempt}`
      codeExists = await db.product.findUnique({ where: { code: uniqueCode } })
    }

    // Check unique SKU
    let uniqueSku = finalSku
    let skuExists = await db.product.findUnique({ where: { sku: uniqueSku } })
    attempt = 0
    while (skuExists && attempt < 10) {
      attempt++
      uniqueSku = `${finalSku}-${attempt}`
      skuExists = await db.product.findUnique({ where: { sku: uniqueSku } })
    }

    // Check unique barcode if provided
    if (barcode) {
      const barcodeExists = await db.product.findFirst({ where: { barcode } })
      if (barcodeExists) {
        return Response.json({ error: 'A product with this barcode already exists' }, { status: 409 })
      }
    }

    const product = await db.product.create({
      data: {
        name: trimmedName,
        code: uniqueCode,
        sku: uniqueSku,
        unit: unit || 'pcs',
        categoryId: categoryId || null,
        supplierId: supplierId || null,
        manufacturer: manufacturer || null,
        modelNumber: modelNumber || null,
        brand: brand || null,
        barcode: barcode || null,
        qrCode: qrCode || null,
        size: size || null,
        length: length || null,
        color: color || null,
        minimumStock: minimumStock || 0,
        maximumStock: maximumStock || 0,
        reorderLevel: reorderLevel || 0,
        unitCost: unitCost || 0,
        parentProductId: parentProductId || null,
        variantName: variantName || null,
        description: description || null,
        storageLocation: storageLocation || null,
        status: 'ACTIVE',
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'PRODUCT_CREATED',
        entityType: 'Product',
        entityId: product.id,
        details: `Quick created product: ${trimmedName} (${uniqueCode})${parentProductId ? ' as variant' : ''}`,
      },
    })

    return Response.json({
      ...product,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/opening-stock/products/quick-create error:', error)
    return Response.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
