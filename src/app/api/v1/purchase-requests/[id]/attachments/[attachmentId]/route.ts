import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'view')) return forbiddenResponse()
  const route = await params
  const item = await db.attachment.findFirst({ where: { id: route.attachmentId, purchaseRequestId: route.id } })
  if (!item) return Response.json({ error: 'Attachment was not found' }, { status: 404 })
  return new Response(item.data, {
    headers: {
      'Content-Type': item.contentType,
      'Content-Length': String(item.sizeBytes),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(item.fileName)}`,
    },
  })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'edit')) return forbiddenResponse()
  const route = await params
  const result = await db.attachment.deleteMany({ where: { id: route.attachmentId, purchaseRequestId: route.id } })
  return result.count ? Response.json({ success: true }) : Response.json({ error: 'Attachment was not found' }, { status: 404 })
}
