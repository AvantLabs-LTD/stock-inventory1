import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { InventoryDomainError, postPartialIssue } from '@/lib/inventory/canonical-ledger'
import { hasPermission } from '@/lib/permissions'
import { stockIssueCreateSchema } from '@/lib/validation/reservation'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'reservations', 'issue')) return forbiddenResponse()
  const parsed = stockIssueCreateSchema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: 'Invalid stock issue', details: parsed.error.flatten() }, { status: 400 })
  const { id } = await params
  try {
    const issue = await postPartialIssue({
      reservationId: id,
      issueNo: parsed.data.issueNo ?? `ISS-${randomUUID().slice(0, 8).toUpperCase()}`,
      actorId: session.user.id,
      remarks: parsed.data.remarks ?? undefined,
      lines: parsed.data.lines.map((line) => ({ ...line, remarks: line.remarks ?? undefined })),
    })
    return Response.json({ data: issue }, { status: 201 })
  } catch (error) {
    if (error instanceof InventoryDomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code.startsWith('INSUFFICIENT') ? 409 : 400
      return Response.json({ error: error.message, code: error.code }, { status })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return Response.json({ error: 'That issue number already exists' }, { status: 409 })
    }
    console.error('POST partial stock issue error:', error)
    return Response.json({ error: 'Failed to post stock issue' }, { status: 500 })
  }
}
