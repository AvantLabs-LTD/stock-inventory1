import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'
import { BomDomainError, reconcileBomLine } from '@/lib/inventory/bom-service'

const reconciliationSchema = z.union([
  z.object({ componentId: z.string().min(1), createComponent: z.never().optional() }),
  z.object({
    componentId: z.never().optional(),
    createComponent: z.object({
      code: z.string().trim().min(1).max(80).optional(),
      unit: z.string().trim().min(1).max(40).optional(),
    }),
  }),
])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string; lineId: string }> }
) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'project_bom', 'edit')) return forbiddenResponse()
  const route = await params

  const parsed = reconciliationSchema.safeParse(await request.json())
  if (!parsed.success) {
    return Response.json({ error: 'Choose an existing component or create a new one', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const line = await reconcileBomLine({
      projectId: route.id,
      uploadId: route.uploadId,
      lineId: route.lineId,
      actorId: session.user.id,
      componentId: parsed.data.componentId,
      createComponent: parsed.data.createComponent,
    })
    return Response.json({ data: line })
  } catch (error) {
    if (error instanceof BomDomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_STATE' ? 409 : 400
      return Response.json({ error: error.message }, { status })
    }
    console.error('PATCH canonical BOM reconciliation error:', error)
    return Response.json({ error: 'Failed to reconcile BOM line' }, { status: 500 })
  }
}
