import { randomUUID } from 'node:crypto'
import { CanonicalRecordStatus, ComponentDiscipline, Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'
import { componentCreateSchema, nullIfBlank } from '@/lib/validation/component'

function generatedCode() {
  return `CMP-${randomUUID().slice(0, 8).toUpperCase()}`
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'components', 'view')) return forbiddenResponse()

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() ?? ''
  const discipline = searchParams.get('discipline')
  const status = searchParams.get('status') ?? 'ACTIVE'
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '25', 10) || 25))

  if (discipline && !Object.values(ComponentDiscipline).includes(discipline as ComponentDiscipline)) {
    return Response.json({ error: 'discipline must be MECHANICAL or ELECTRONICS' }, { status: 400 })
  }
  if (status !== 'ALL' && !Object.values(CanonicalRecordStatus).includes(status as CanonicalRecordStatus)) {
    return Response.json({ error: 'Invalid component status filter' }, { status: 400 })
  }

  const where: Prisma.ComponentWhereInput = {
    ...(status === 'ALL' ? {} : { status: status as CanonicalRecordStatus }),
    ...(discipline ? { discipline: discipline as ComponentDiscipline } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    db.component.findMany({
      where,
      include: { balance: true },
      orderBy: [{ title: 'asc' }, { code: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.component.count({ where }),
  ])

  return Response.json({
    data: items.map((item) => ({
      ...item,
      balance: {
        onHand: item.balance?.onHand ?? new Prisma.Decimal(0),
        allocated: item.balance?.allocated ?? new Prisma.Decimal(0),
        available: (item.balance?.onHand ?? new Prisma.Decimal(0)).minus(
          item.balance?.allocated ?? new Prisma.Decimal(0)
        ),
      },
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'components', 'create')) return forbiddenResponse()

  const parsed = componentCreateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return Response.json({ error: 'Invalid component', details: parsed.error.flatten() }, { status: 400 })
  }
  const input = parsed.data

  try {
    const component = await db.component.create({
      data: {
        code: input.code?.toUpperCase() ?? generatedCode(),
        title: input.title,
        discipline: input.discipline,
        description: input.description,
        function: nullIfBlank(input.function),
        link: nullIfBlank(input.link),
        optionSelection: nullIfBlank(input.optionSelection),
        remarks: nullIfBlank(input.remarks),
        unit: input.unit ?? 'pcs',
        createdById: session.user.id,
        balance: { create: {} },
      },
      include: { balance: true },
    })
    return Response.json({ data: component }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return Response.json({ error: 'A component with this code already exists' }, { status: 409 })
    }
    console.error('POST /api/v1/components error:', error)
    return Response.json({ error: 'Failed to create component' }, { status: 500 })
  }
}
