import { NextRequest } from 'next/server'
import { BomImportError, parseBomWorkbook } from '@/lib/inventory/bom-import'
import { BomDomainError, createBomUpload } from '@/lib/inventory/bom-service'
import { db } from '@/lib/db'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'
import { isUploadTooLarge, MAX_UPLOAD_LABEL } from '@/lib/upload-limits'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'project_bom', 'view')) return forbiddenResponse()
  const { id: projectId } = await params

  const uploads = await db.projectBomUpload.findMany({
    where: { projectId },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      acceptedBy: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return Response.json({ data: uploads })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'project_bom', 'create')) return forbiddenResponse()
  const { id: projectId } = await params

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return Response.json({ error: 'An Excel file is required' }, { status: 400 })
  if (isUploadTooLarge(file)) {
    return Response.json({ error: `File is too large. Maximum upload size is ${MAX_UPLOAD_LABEL}.` }, { status: 413 })
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return Response.json({ error: 'Project BOMs must use the .xlsx format' }, { status: 400 })
  }

  try {
    const parsed = await parseBomWorkbook(file)
    const upload = await createBomUpload({
      projectId,
      fileName: file.name,
      sheetName: parsed.sheetName,
      uploadedById: session.user.id,
      rows: parsed.rows,
    })
    return Response.json({ data: upload }, { status: 201 })
  } catch (error) {
    if (error instanceof BomImportError) {
      return Response.json({ error: error.message, row: error.row }, { status: 400 })
    }
    if (error instanceof BomDomainError && error.code === 'NOT_FOUND') {
      return Response.json({ error: error.message }, { status: 404 })
    }
    console.error('POST canonical BOM upload error:', error)
    return Response.json({ error: 'Failed to stage project BOM' }, { status: 500 })
  }
}
