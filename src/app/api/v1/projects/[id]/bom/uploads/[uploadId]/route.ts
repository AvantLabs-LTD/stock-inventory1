import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'project_bom', 'view')) return forbiddenResponse()
  const { id: projectId, uploadId } = await params

  const upload = await db.projectBomUpload.findFirst({
    where: { id: uploadId, projectId },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      acceptedBy: { select: { id: true, name: true } },
      lines: {
        orderBy: { sortOrder: 'asc' },
        include: {
          component: { include: { balance: true } },
          reconciledBy: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!upload) return Response.json({ error: 'BOM upload not found' }, { status: 404 })
  return Response.json({ data: upload })
}
