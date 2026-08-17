import { Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, forbiddenResponse, unauthorizedResponse } from '@/lib/auth-middleware'
import { hasPermission } from '@/lib/permissions'
import { componentUpdateSchema, nullIfBlank } from '@/lib/validation/component'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'components', 'view')) return forbiddenResponse()

  const { id } = await params
  const component = await db.component.findUnique({
    where: { id },
    include: {
      balance: true,
      _count: {
        select: {
          projectComponents: true,
          reservationLines: true,
          purchaseRequestLines: true,
          ledgerEntries: true,
        },
      },
    },
  })
  if (!component) return Response.json({ error: 'Component not found' }, { status: 404 })

  const zero = new Prisma.Decimal(0)
  return Response.json({
    data: {
      ...component,
      balance: {
        onHand: component.balance?.onHand ?? zero,
        allocated: component.balance?.allocated ?? zero,
        available: (component.balance?.onHand ?? zero).minus(component.balance?.allocated ?? zero),
      },
    },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'components', 'edit')) return forbiddenResponse()

  const { id } = await params
  const parsed = componentUpdateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return Response.json({ error: 'Invalid component', details: parsed.error.flatten() }, { status: 400 })
  }
  const input = parsed.data

  try {
    const component = await db.component.update({
      where: { id },
      data: {
        ...(input.code !== undefined && { code: input.code.toUpperCase() }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.discipline !== undefined && { discipline: input.discipline }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.function !== undefined && { function: nullIfBlank(input.function) }),
        ...(input.link !== undefined && { link: nullIfBlank(input.link) }),
        ...(input.optionSelection !== undefined && { optionSelection: nullIfBlank(input.optionSelection) }),
        ...(input.remarks !== undefined && { remarks: nullIfBlank(input.remarks) }),
        ...(input.unit !== undefined && { unit: input.unit }),
        ...(input.status !== undefined && { status: input.status }),
      },
      include: { balance: true },
    })
    return Response.json({ data: component })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return Response.json({ error: 'Component not found' }, { status: 404 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return Response.json({ error: 'A component with this code already exists' }, { status: 409 })
    }
    console.error('PATCH /api/v1/components/[id] error:', error)
    return Response.json({ error: 'Failed to update component' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.user.role, 'components', 'delete')) return forbiddenResponse()

  const { id } = await params
  try {
    const component = await db.component.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    })
    return Response.json({ data: component })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return Response.json({ error: 'Component not found' }, { status: 404 })
    }
    console.error('DELETE /api/v1/components/[id] error:', error)
    return Response.json({ error: 'Failed to archive component' }, { status: 500 })
  }
}
