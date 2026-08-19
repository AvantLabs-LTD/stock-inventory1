import { NextRequest } from 'next/server'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'
import { acceptBomUpload, BomDomainError } from '@/lib/inventory/bom-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'project_bom', 'approve')) return forbiddenResponse()
  const { id: projectId, uploadId } = await params

  try {
    const upload = await acceptBomUpload({ projectId, uploadId, actorId: session.user.id })
    return Response.json({ data: upload })
  } catch (error) {
    if (error instanceof BomDomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'UNRECONCILED' ? 422 : 409
      return Response.json({ error: error.message }, { status })
    }
    console.error('POST canonical BOM acceptance error:', error)
    return Response.json({ error: 'Failed to accept BOM' }, { status: 500 })
  }
}
