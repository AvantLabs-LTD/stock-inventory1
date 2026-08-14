import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'

// ─── GET /api/opening-stock/projects — List all ProjectFields ──────────────
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'view')) {
      return forbiddenResponse('No permission to view project fields')
    }

    const projectFields = await db.projectField.findMany({
      orderBy: { name: 'asc' },
      include: {
        productQtys: {
          select: { id: true },
        },
      },
    })

    const result = projectFields.map((pf) => ({
      id: pf.id,
      name: pf.name,
      code: pf.code,
      createdAt: pf.createdAt.toISOString(),
      productCount: pf.productQtys.length,
    }))

    return Response.json({ data: result })
  } catch (error) {
    console.error('GET /api/opening-stock/projects error:', error)
    return Response.json({ error: 'Failed to fetch project fields' }, { status: 500 })
  }
}

// ─── POST /api/opening-stock/projects — Create ProjectField ─────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return unauthorizedResponse()
    if (!hasPermission(session.user.role, 'stock', 'manage')) {
      return forbiddenResponse('Only SUPER_ADMIN and INVENTORY_ADMIN can create project fields')
    }

    const body = await request.json()
    const { name, code } = body

    if (!name || !name.trim()) {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Auto-generate code from name if not provided
    const finalCode = code?.trim() || generateCodeFromName(trimmedName)

    // Check for unique name
    const existingName = await db.projectField.findUnique({
      where: { name: trimmedName },
    })
    if (existingName) {
      return Response.json({ error: 'A project field with this name already exists' }, { status: 409 })
    }

    // Check for unique code
    const existingCode = await db.projectField.findUnique({
      where: { code: finalCode },
    })
    if (existingCode) {
      return Response.json({ error: 'A project field with this code already exists' }, { status: 409 })
    }

    const projectField = await db.projectField.create({
      data: {
        name: trimmedName,
        code: finalCode,
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        action: 'PROJECT_FIELD_CREATED',
        entityType: 'ProjectField',
        entityId: projectField.id,
        details: `Created project field: ${trimmedName} (${finalCode})`,
      },
    })

    return Response.json({
      ...projectField,
      createdAt: projectField.createdAt.toISOString(),
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/opening-stock/projects error:', error)
    return Response.json({ error: 'Failed to create project field' }, { status: 500 })
  }
}

// ─── Helper: Generate code from name ──────────────────────────────────────
function generateCodeFromName(name: string): string {
  // Take first letters of each word, uppercase, remove non-alpha chars
  // e.g., "Block A - CHS" -> "BACHS"
  const words = name.split(/[\s\-_/]+/).filter(Boolean)
  if (words.length === 0) return name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

  let code = ''
  if (words.length >= 2) {
    // Take first 2 letters of first word + first letter of subsequent words
    code = words[0].slice(0, 2).toUpperCase()
    for (let i = 1; i < words.length && code.length < 6; i++) {
      code += words[i].slice(0, 1).toUpperCase()
    }
  } else {
    code = words[0].toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  }

  return code || name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}
