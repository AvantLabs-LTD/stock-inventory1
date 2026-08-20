import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { InventoryDomainError, postStockReturn } from '@/lib/inventory/canonical-ledger'
import { hasPermission } from '@/lib/permissions'

const quantity = z.union([z.number().positive(), z.string().trim().regex(/^\d+(\.\d+)?$/)])
const schema = z.object({
  returnNo: z.string().trim().min(1).max(80).optional(),
  reason: z.string().trim().max(1000).optional().nullable(),
  remarks: z.string().trim().max(4000).optional().nullable(),
  lines: z.array(z.object({ issueLineId: z.string().min(1), quantity, remarks: z.string().trim().max(4000).optional().nullable() })).min(1).max(500),
})

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'returns', 'create')) return forbiddenResponse()
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'Invalid stock return', details: parsed.error.flatten() }, { status: 400 })
  try {
    const result = await postStockReturn({
      returnNo: parsed.data.returnNo ?? `RET-${randomUUID().slice(0, 8).toUpperCase()}`,
      idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
      actorId: session.user.id,
      reason: parsed.data.reason ?? undefined,
      remarks: parsed.data.remarks ?? undefined,
      lines: parsed.data.lines.map((line) => ({ ...line, remarks: line.remarks ?? undefined })),
    })
    return Response.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof InventoryDomainError) return Response.json({ error: error.message, code: error.code }, { status: error.code === 'NOT_FOUND' ? 404 : 409 })
    console.error('POST canonical stock return error:', error)
    return Response.json({ error: 'Failed to post stock return' }, { status: 500 })
  }
}
