import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'
import { getProjectComponentRequirements } from '@/lib/inventory/project-requirements'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'project_bom', 'view')) return forbiddenResponse()
  const { id: projectId } = await params

  const [requirements, lines] = await Promise.all([
    getProjectComponentRequirements(projectId),
    db.projectComponent.findMany({
      where: {
        projectId,
        OR: [
          { bomUploadId: null },
          { bomUpload: { status: 'ACCEPTED' } },
        ],
      },
      include: { component: { include: { balance: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
  ])
  const requirementByLine = new Map(requirements.map((item) => [item.projectComponentId, item]))
  return Response.json({
    data: lines.map((line) => ({ ...line, requirement: requirementByLine.get(line.id) ?? null })),
  })
}
