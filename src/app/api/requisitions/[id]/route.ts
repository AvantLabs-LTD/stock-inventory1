import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// GET /api/requisitions/[id] — Get single material requisition detail with stock info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'inventory_requests', 'view')) {
      return forbiddenResponse('No permission to view inventory requests')
    }

    const { id } = await params

    const requisition = await db.materialRequisition.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        requestedByUser: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true, sku: true, unit: true, variantName: true } },
          },
        },
      },
    })

    if (!requisition) {
      return Response.json({ error: 'Requisition not found' }, { status: 404 })
    }

    // Fetch stock availability for each item's product
    const productIds = requisition.items.map((item) => item.productId)
    // InventoryItem is a legacy name/spec register without a Product relation,
    // so build the lookup explicitly until it is replaced by Component.
    const allInventory = await db.inventoryItem.findMany({
      where: { status: 'ACTIVE' },
    })

    // Build a lookup: productName+variantName → stock info
    const stockLookup = new Map<string, { totalStock: number; issuedQty: number; reservedQty: number; available: number }>()
    for (const inv of allInventory) {
      const key = `${inv.itemName}|${inv.specification}`
      const existing = stockLookup.get(key)
      const avail = Math.max(0, inv.quantity - inv.issuedQty - inv.reservedQty)
      if (existing) {
        existing.totalStock += inv.quantity
        existing.issuedQty += inv.issuedQty
        existing.reservedQty += inv.reservedQty
        existing.available += avail
      } else {
        stockLookup.set(key, {
          totalStock: inv.quantity,
          issuedQty: inv.issuedQty,
          reservedQty: inv.reservedQty,
          available: avail,
        })
      }
    }

    // Fetch product info to build lookup
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, variantName: true, parentProductId: true },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    // Build enriched items with stock info
    const enrichedItems = requisition.items.map((item) => {
      const prod = productMap.get(item.productId)
      const parentName = prod?.name || item.product.name
      const specName = prod?.variantName || item.specDescription || ''
      const stockKey = `${parentName}|${specName}`
      const stock = stockLookup.get(stockKey) || { totalStock: 0, issuedQty: 0, reservedQty: 0, available: 0 }

      return {
        ...item,
        stockInfo: {
          totalInStock: stock.totalStock,
          totalIssued: stock.issuedQty,
          totalReserved: stock.reservedQty,
          availableInStore: stock.available,
        },
      }
    })

    const result = {
      ...requisition,
      items: enrichedItems,
    }

    return Response.json({ data: result })
  } catch (error) {
    console.error('GET /api/requisitions/[id] error:', error)
    return Response.json({ error: 'Failed to fetch requisition detail' }, { status: 500 })
  }
}

// PUT /api/requisitions/[id] — Update material requisition
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()

    if (!hasPermission(session.user.role, 'inventory_requests', 'edit')) {
      return forbiddenResponse('No permission to edit inventory requests')
    }

    const { id } = await params
    const body = await request.json()
    const { issuedByName, receivedByName, remarks } = body

    // Find the requisition
    const requisition = await db.materialRequisition.findUnique({
      where: { id },
    })

    if (!requisition) {
      return Response.json({ error: 'Requisition not found' }, { status: 404 })
    }

    if (requisition.status !== 'APPROVED' && requisition.status !== 'PARTIAL_APPROVED') {
      return Response.json(
        { error: `Cannot update a requisition with status ${requisition.status}. Must be APPROVED or PARTIAL_APPROVED.` },
        { status: 400 }
      )
    }

    // Build update data
    const data: Record<string, unknown> = {}
    if (issuedByName !== undefined) data.issuedByName = issuedByName || null
    if (receivedByName !== undefined) data.receivedByName = receivedByName || null
    if (remarks !== undefined) data.remarks = remarks || null

    // Update the requisition
    const updated = await db.materialRequisition.update({
      where: { id },
      data,
      include: {
        department: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        requestedByUser: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true, sku: true, unit: true } },
          },
        },
      },
    })

    return Response.json({ data: updated })
  } catch (error) {
    console.error('PUT /api/requisitions/[id] error:', error)
    return Response.json({ error: 'Failed to update requisition' }, { status: 500 })
  }
}
