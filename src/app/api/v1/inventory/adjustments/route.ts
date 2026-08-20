import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { InventoryDomainError, postInventoryAdjustment } from '@/lib/inventory/canonical-ledger'
import { hasPermission } from '@/lib/permissions'

const decimal = z.union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/)])
const schema = z.object({
  kind: z.enum(['OPENING', 'ADJUSTMENT']).default('ADJUSTMENT'),
  adjustmentNo: z.string().trim().min(1).max(80).optional(),
  reason: z.string().trim().min(1).max(500),
  remarks: z.string().trim().max(4000).optional().nullable(),
  lines: z.array(z.object({
    componentId: z.string().min(1),
    quantity: decimal,
    remarks: z.string().trim().max(4000).optional().nullable(),
  })).min(1).max(500),
})

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'stock', 'adjust')) return forbiddenResponse()
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'Invalid inventory adjustment', details: parsed.error.flatten() }, { status: 400 })
  try {
    const adjustment = await postInventoryAdjustment({
      adjustmentNo: parsed.data.adjustmentNo ?? `ADJ-${randomUUID().slice(0, 8).toUpperCase()}`,
      idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
      kind: parsed.data.kind,
      actorId: session.user.id,
      reason: parsed.data.reason,
      remarks: parsed.data.remarks ?? undefined,
      lines: parsed.data.lines.map((line) => ({ ...line, remarks: line.remarks ?? undefined })),
    })
    return Response.json({ data: adjustment }, { status: 201 })
  } catch (error) {
    if (error instanceof InventoryDomainError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.code === 'NOT_FOUND' ? 404 : 409 })
    }
    console.error('POST canonical adjustment error:', error)
    return Response.json({ error: 'Failed to post inventory adjustment' }, { status: 500 })
  }
}
