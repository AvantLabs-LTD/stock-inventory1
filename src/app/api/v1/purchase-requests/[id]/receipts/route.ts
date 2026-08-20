import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { InventoryDomainError, postGoodsReceipt } from '@/lib/inventory/canonical-ledger'
import { hasPermission } from '@/lib/permissions'
import { goodsReceiptCreateSchema } from '@/lib/validation/purchase-request'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'receive')) return forbiddenResponse()
  const parsed = goodsReceiptCreateSchema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'Invalid goods receipt', details: parsed.error.flatten() }, { status: 400 })
  const purchaseRequestId = (await params).id
  const purchaseLines = await db.purchaseRequestLine.findMany({ where: { purchaseRequestId } })
  const byId = new Map(purchaseLines.map((line) => [line.id, line]))
  if (parsed.data.lines.some((line) => !byId.has(line.purchaseRequestLineId))) {
    return Response.json({ error: 'A receipt line does not belong to this purchase request' }, { status: 400 })
  }
  try {
    const receipt = await postGoodsReceipt({
      receiptNo: parsed.data.receiptNo ?? `GR-${randomUUID().slice(0, 8).toUpperCase()}`,
      idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
      purchaseRequestId,
      actorId: session.user.id,
      provider: parsed.data.provider ?? undefined,
      trackingNumber: parsed.data.trackingNumber ?? undefined,
      boxNumber: parsed.data.boxNumber ?? undefined,
      remarks: parsed.data.remarks ?? undefined,
      lines: parsed.data.lines.map((line) => ({
        ...line,
        componentId: byId.get(line.purchaseRequestLineId)!.componentId,
        remarks: line.remarks ?? undefined,
      })),
    })
    return Response.json({ data: receipt }, { status: 201 })
  } catch (error) {
    if (error instanceof InventoryDomainError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.code === 'NOT_FOUND' ? 404 : 409 })
    }
    throw error
  }
}
