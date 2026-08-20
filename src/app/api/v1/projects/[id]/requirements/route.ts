import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'project_bom', 'view')) return forbiddenResponse()
  const { id: projectId } = await params

  const lines = await db.projectComponent.findMany({
    where: { projectId, bomUpload: { status: 'ACCEPTED' } },
    include: { component: { include: { balance: true } } },
    orderBy: { sortOrder: 'asc' },
  })
  return Response.json({ data: lines })
}
