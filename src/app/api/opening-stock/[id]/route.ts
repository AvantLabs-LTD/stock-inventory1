import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── GET /api/opening-stock/:id — Full detail with ledger, project qtys, custom values ──
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view opening stock')
    }

    const { id } = await params

    const entry = await db.openingStock.findUnique({
      where: { id },
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
        deletedByUser: { select: { id: true, name: true } },
        importBatch: { select: { id: true, fileName: true, createdAt: true } },
        ledger: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
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
    })

    if (!entry) {
      return Response.json({ error: 'Opening stock entry not found' }, { status: 404 })
    }

    const product = entry.product
    const computedStockStatus = computeStockStatus(
      entry.currentStock,
      product.minimumStock,
      product.reorderLevel
    )

    return Response.json({
      ...entry,
      openingDate: entry.openingDate.toISOString(),
      expiryDate: entry.expiryDate?.toISOString() ?? null,
      receivedDate: entry.receivedDate?.toISOString() ?? null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      deletedAt: entry.deletedAt?.toISOString() ?? null,
      lastTransactionAt: entry.lastTransactionAt?.toISOString() ?? null,
      stockStatus: computedStockStatus,
      ledger: entry.ledger.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('GET /api/opening-stock/:id error:', error)
    return Response.json({ error: 'Failed to fetch opening stock entry' }, { status: 500 })
  }
}

// ─── PUT /api/opening-stock/:id — Update (limited fields only) ───────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can edit opening stock')
    }

    const { id } = await params
    const body = await request.json()

    // Find existing entry
    const existing = await db.openingStock.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true } },
      },
    })

    if (!existing) {
      return Response.json({ error: 'Opening stock entry not found' }, { status: 404 })
    }

    if (existing.status === 'DELETED') {
      return Response.json({ error: 'Cannot edit a deleted entry. Restore it first.' }, { status: 400 })
    }

    // Only allow specific fields to be edited
    const allowedFields = [
      'remarks', 'internalNotes', 'batchNumber', 'serialNumber',
      'expiryDate', 'storageLocation',
    ]

    const updateData: Record<string, unknown> = {}
    const changes: string[] = []

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'expiryDate') {
          updateData[field] = body[field] ? new Date(body[field]) : null
        } else {
          updateData[field] = body[field] ?? null
        }
        if (JSON.stringify(body[field] ?? null) !== JSON.stringify((existing as Record<string, unknown>)[field] ?? null)) {
          changes.push(`${field} changed`)
        }
      }
    }

    // Reject quantity/cost edits
    if (body.quantity !== undefined || body.unitCost !== undefined) {
      return Response.json({
        error: 'Quantity and unit cost cannot be edited after creation. Use stock adjustments instead.',
      }, { status: 400 })
    }

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Check if stock-related fields changed (need ledger entry)
    const stockRelatedFields = ['batchNumber', 'serialNumber', 'storageLocation']
    const hasStockChange = stockRelatedFields.some((f) => updateData[f] !== undefined)

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.openingStock.update({
        where: { id },
        data: updateData,
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

      // Create ledger entry if stock-related fields changed
      if (hasStockChange) {
        await tx.stockLedger.create({
          data: {
            openingStockId: id,
            transactionType: 'ADJUSTMENT_IN',
            quantity: 0,
            oldStock: existing.currentStock,
            newStock: existing.currentStock,
            userId: session.user.id,
            warehouse: existing.warehouse,
            remarks: `Metadata updated: ${changes.join(', ')}`,
          },
        })
      }

      return result
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'OPENING_STOCK_UPDATED',
        entityType: 'OpeningStock',
        entityId: id,
        details: `Edited opening stock for ${existing.product.name}: ${changes.join(', ')}`,
      },
    })

    return Response.json({
      ...updated,
      openingDate: updated.openingDate.toISOString(),
      expiryDate: updated.expiryDate?.toISOString() ?? null,
      receivedDate: updated.receivedDate?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      lastTransactionAt: updated.lastTransactionAt?.toISOString() ?? null,
    })
  } catch (error) {
    console.error('PUT /api/opening-stock/:id error:', error)
    return Response.json({ error: 'Failed to update opening stock' }, { status: 500 })
  }
}

// ─── DELETE /api/opening-stock/:id — Soft delete ────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can delete opening stock')
    }

    const { id } = await params

    const existing = await db.openingStock.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true } },
      },
    })

    if (!existing) {
      return Response.json({ error: 'Opening stock entry not found' }, { status: 404 })
    }

    if (existing.status === 'DELETED') {
      return Response.json({ error: 'Entry is already deleted' }, { status: 400 })
    }

    await db.$transaction(async (tx) => {
      // Soft delete
      await tx.openingStock.update({
        where: { id },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedBy: session.user.id,
        },
      })

      // Create ledger entry
      await tx.stockLedger.create({
        data: {
          openingStockId: id,
          transactionType: 'SCRAPPED',
          quantity: existing.currentStock,
          oldStock: existing.currentStock,
          newStock: 0,
          userId: session.user.id,
          warehouse: existing.warehouse,
          remarks: `Soft deleted by ${session.user.name}`,
        },
      })
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'OPENING_STOCK_DELETED',
        entityType: 'OpeningStock',
        entityId: id,
        details: `Soft deleted opening stock for ${existing.product.name} (qty was ${existing.currentStock})`,
      },
    })

    return Response.json({ success: true, message: 'Opening stock entry deleted' })
  } catch (error) {
    console.error('DELETE /api/opening-stock/:id error:', error)
    return Response.json({ error: 'Failed to delete opening stock' }, { status: 500 })
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
