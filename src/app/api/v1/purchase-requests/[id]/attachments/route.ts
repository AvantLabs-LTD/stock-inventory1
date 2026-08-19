import { AttachmentKind } from '@prisma/client'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'
import { isUploadTooLarge, MAX_UPLOAD_LABEL } from '@/lib/upload-limits'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'view')) return forbiddenResponse()
  const data = await db.attachment.findMany({
    where: { purchaseRequestId: (await params).id },
    select: { id: true, fileName: true, contentType: true, sizeBytes: true, kind: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return Response.json({ data })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'purchase_requests', 'edit')) return forbiddenResponse()
  const purchaseRequestId = (await params).id
  if (!(await db.purchaseRequest.findUnique({ where: { id: purchaseRequestId }, select: { id: true } }))) {
    return Response.json({ error: 'Purchase request was not found' }, { status: 404 })
  }
  const form = await request.formData()
  const file = form.get('file')
  const requestedKind = String(form.get('kind') ?? 'OTHER')
  if (!(file instanceof File)) return Response.json({ error: 'A file is required' }, { status: 400 })
  if (isUploadTooLarge(file)) return Response.json({ error: `File is too large. Maximum upload size is ${MAX_UPLOAD_LABEL}.` }, { status: 413 })
  if (!Object.values(AttachmentKind).includes(requestedKind as AttachmentKind)) {
    return Response.json({ error: 'Invalid attachment kind' }, { status: 400 })
  }
  const attachment = await db.attachment.create({
    data: {
      purchaseRequestId,
      kind: requestedKind as AttachmentKind,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      data: Buffer.from(await file.arrayBuffer()),
      uploadedById: session.user.id,
    },
    select: { id: true, fileName: true, contentType: true, sizeBytes: true, kind: true, createdAt: true },
  })
  return Response.json({ data: attachment }, { status: 201 })
}
