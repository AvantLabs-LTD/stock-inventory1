import { randomUUID } from 'node:crypto'
import {
  CanonicalReservationStatus,
  Prisma,
  ProjectComponentReconciliationStatus,
  ReservationRequestStatus,
} from '@prisma/client'
import { db } from '@/lib/db'
import type { ProjectComponentRequirement } from '@/lib/inventory/project-requirements'

const ZERO = new Prisma.Decimal(0)

export class ReservationDomainError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'INVALID_STATE' | 'UNRECONCILED' | 'INVALID_DESTINATION' | 'FORBIDDEN'
  ) {
    super(message)
    this.name = 'ReservationDomainError'
  }
}

export interface ReservationRequestItemInput {
  projectComponentId?: string
  componentId?: string
  title?: string
  discipline?: 'MECHANICAL' | 'ELECTRONICS'
  description?: string
  function?: string | null
  link?: string | null
  optionSelection?: string | null
  remarks?: string | null
  quantity?: Prisma.Decimal | string | number
}

function generatedNo(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`
}

function nullable(value?: string | null) {
  return value?.trim() || null
}

export async function createReservationRequest(input: {
  projectId?: string
  departmentId?: string
  requestedById: string
  requesterDepartmentId: string | null
  mayRequestForAnyDepartment: boolean
  remarks?: string | null
  items: ReservationRequestItemInput[]
}) {
  if (Boolean(input.projectId) === Boolean(input.departmentId)) {
    throw new ReservationDomainError('Choose exactly one destination: project or department', 'INVALID_DESTINATION')
  }
  if (input.items.length === 0) throw new ReservationDomainError('At least one item is required', 'INVALID_STATE')

  return db.$transaction(async (tx) => {
    let destinationDepartmentId: string
    if (input.projectId) {
      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, departmentId: true },
      })
      if (!project) throw new ReservationDomainError('Project was not found', 'NOT_FOUND')
      destinationDepartmentId = project.departmentId
    } else {
      const department = await tx.department.findUnique({
        where: { id: input.departmentId! },
        select: { id: true },
      })
      if (!department) throw new ReservationDomainError('Department was not found', 'NOT_FOUND')
      destinationDepartmentId = department.id
    }

    if (!input.mayRequestForAnyDepartment && input.requesterDepartmentId !== destinationDepartmentId) {
      throw new ReservationDomainError('Users may only request for their own department or its projects', 'FORBIDDEN')
    }

    const request = await tx.reservationRequest.create({
      data: {
        requestNo: generatedNo('RRQ'),
        projectId: input.projectId,
        departmentId: input.departmentId,
        requestedById: input.requestedById,
        remarks: nullable(input.remarks),
      },
    })

    for (const [sortOrder, item] of input.items.entries()) {
      let snapshot: {
        componentId: string | null
        projectComponentId: string | null
        title: string
        discipline: 'MECHANICAL' | 'ELECTRONICS'
        description: string
        function: string | null
        link: string | null
        optionSelection: string | null
        remarks: string | null
        quantity: Prisma.Decimal
      }

      if (item.projectComponentId) {
        const active = await tx.$queryRaw<Array<{ projectComponentId: string }>>`
          SELECT "projectComponentId"
          FROM "active_project_component_requirements"
          WHERE "projectComponentId" = ${item.projectComponentId}
            AND "projectId" = ${input.projectId!}
        `
        const line = active[0]
          ? await tx.projectComponent.findUnique({ where: { id: item.projectComponentId } })
          : null
        if (!line) throw new ReservationDomainError('Active project component was not found', 'NOT_FOUND')
        snapshot = {
          componentId: line.componentId,
          projectComponentId: line.id,
          title: line.title,
          discipline: line.discipline,
          description: line.description,
          function: line.function,
          link: line.link,
          optionSelection: line.optionSelection,
          remarks: line.remarks,
          quantity: line.quantity,
        }
      } else if (item.componentId) {
        const component = await tx.component.findFirst({
          where: { id: item.componentId, status: { not: 'ARCHIVED' } },
        })
        if (!component) throw new ReservationDomainError('Component was not found', 'NOT_FOUND')
        snapshot = {
          componentId: component.id,
          projectComponentId: null,
          title: component.title,
          discipline: component.discipline,
          description: component.description,
          function: component.function,
          link: component.link,
          optionSelection: component.optionSelection,
          remarks: nullable(item.remarks) ?? component.remarks,
          quantity: new Prisma.Decimal(item.quantity!),
        }
      } else {
        snapshot = {
          componentId: null,
          projectComponentId: null,
          title: item.title!,
          discipline: item.discipline!,
          description: item.description!,
          function: nullable(item.function),
          link: nullable(item.link),
          optionSelection: nullable(item.optionSelection),
          remarks: nullable(item.remarks),
          quantity: new Prisma.Decimal(item.quantity!),
        }
      }

      if (!snapshot.quantity.isPositive()) {
        throw new ReservationDomainError('Item quantity must be greater than zero', 'INVALID_STATE')
      }
      await tx.reservationRequestLine.create({ data: { requestId: request.id, sortOrder, ...snapshot } })
    }

    return tx.reservationRequest.findUnique({
      where: { id: request.id },
      include: { project: true, department: true, requestedBy: true, items: { include: { component: true } } },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function reconcileReservationRequestLine(input: {
  requestId: string
  lineId: string
  actorId: string
  componentId?: string
  createComponent?: { code?: string; unit?: string }
}) {
  return db.$transaction(async (tx) => {
    const line = await tx.reservationRequestLine.findFirst({
      where: { id: input.lineId, requestId: input.requestId },
      include: { request: { select: { status: true } } },
    })
    if (!line) throw new ReservationDomainError('Reservation request line was not found', 'NOT_FOUND')
    if (line.request.status !== ReservationRequestStatus.SUBMITTED) {
      throw new ReservationDomainError('Only submitted requests can be reconciled', 'INVALID_STATE')
    }
    if (Boolean(input.componentId) === Boolean(input.createComponent)) {
      throw new ReservationDomainError('Choose an existing component or create a new one', 'INVALID_STATE')
    }

    let componentId = input.componentId
    if (componentId) {
      const component = await tx.component.findFirst({ where: { id: componentId, status: { not: 'ARCHIVED' } } })
      if (!component) throw new ReservationDomainError('Component was not found', 'NOT_FOUND')
    } else {
      const component = await tx.component.create({
        data: {
          code: input.createComponent?.code?.trim().toUpperCase() || generatedNo('CMP'),
          title: line.title,
          discipline: line.discipline,
          description: line.description,
          function: line.function,
          link: line.link,
          optionSelection: line.optionSelection,
          remarks: line.remarks,
          unit: input.createComponent?.unit?.trim() || 'pcs',
          createdById: input.actorId,
          balance: { create: {} },
        },
      })
      componentId = component.id
    }

    return tx.reservationRequestLine.update({
      where: { id: line.id },
      data: { componentId },
      include: { component: true, projectComponent: true },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function convertReservationRequest(input: { requestId: string; actorId: string }) {
  return db.$transaction(async (tx) => {
    const request = await tx.reservationRequest.findUnique({ where: { id: input.requestId }, include: { items: true } })
    if (!request) throw new ReservationDomainError('Reservation request was not found', 'NOT_FOUND')
    if (request.status !== ReservationRequestStatus.SUBMITTED) {
      throw new ReservationDomainError('Only submitted requests can be converted', 'INVALID_STATE')
    }
    if (request.items.length === 0 || request.items.some((line) => !line.componentId)) {
      throw new ReservationDomainError('Every request line must be reconciled before conversion', 'UNRECONCILED')
    }

    for (const line of request.items.filter((item) => item.projectComponentId)) {
      const active = await tx.$queryRaw<Array<{ componentId: string | null }>>`
        SELECT "componentId" FROM "active_project_component_requirements"
        WHERE "projectComponentId" = ${line.projectComponentId!}
      `
      if (!active[0] || active[0].componentId !== line.componentId) {
        throw new ReservationDomainError('A project component is no longer active or its reconciliation changed', 'INVALID_STATE')
      }
    }

    const reservation = await tx.reservation.create({
      data: {
        reservationNo: generatedNo('RSV'),
        requestId: request.id,
        projectId: request.projectId,
        departmentId: request.departmentId,
        convertedById: input.actorId,
        remarks: request.remarks,
        lines: {
          create: request.items.map((line) => ({
            requestLineId: line.id,
            componentId: line.componentId!,
            projectComponentId: line.projectComponentId,
            requestedQuantity: line.projectComponentId ? null : line.quantity,
            remarks: line.remarks,
          })),
        },
      },
      include: { lines: true },
    })
    await tx.reservationRequest.update({ where: { id: request.id }, data: { status: ReservationRequestStatus.CONVERTED } })
    return reservation
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

type RequirementWithLine = ProjectComponentRequirement & { title: string; description: string }

export async function getReservationDetail(reservationId: string) {
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    include: {
      project: true,
      department: true,
      request: { include: { requestedBy: { select: { id: true, name: true, email: true } } } },
      issues: { include: { lines: true }, orderBy: { postedAt: 'asc' } },
      lines: {
        include: {
          component: { include: { balance: true } },
          projectComponent: true,
          allocationEntries: { orderBy: { createdAt: 'asc' } },
          issueLines: true,
          purchaseLinks: { include: { purchaseRequestLine: { include: { purchaseRequest: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!reservation) throw new ReservationDomainError('Reservation was not found', 'NOT_FOUND')

  let requirements: RequirementWithLine[] = []
  if (reservation.projectId) {
    requirements = await db.$queryRaw<RequirementWithLine[]>`
      SELECT requirement.*, line."title", line."description"
      FROM "project_component_requirements" requirement
      JOIN "project_components" line ON line."id" = requirement."projectComponentId"
      WHERE requirement."projectId" = ${reservation.projectId}
      ORDER BY requirement."depth", requirement."projectComponentId"
    `
  }
  const requirementById = new Map(requirements.map((item) => [item.projectComponentId, item]))
  const children = new Map<string, RequirementWithLine[]>()
  for (const item of requirements) {
    if (!item.parentProjectComponentId) continue
    children.set(item.parentProjectComponentId, [...(children.get(item.parentProjectComponentId) ?? []), item])
  }
  function blockingDescendants(id: string) {
    const result: RequirementWithLine[] = []
    const pending = [...(children.get(id) ?? [])]
    while (pending.length) {
      const child = pending.shift()!
      if (child.isBlocker) result.push(child)
      pending.push(...(children.get(child.projectComponentId) ?? []))
    }
    return result
  }
  const relevantRequirementIds = new Set<string>()
  for (const line of reservation.lines) {
    if (!line.projectComponentId) continue
    relevantRequirementIds.add(line.projectComponentId)
    for (const blocker of blockingDescendants(line.projectComponentId)) {
      relevantRequirementIds.add(blocker.projectComponentId)
    }
  }

  const lines = reservation.lines.map((line) => {
    const requirement = line.projectComponentId ? requirementById.get(line.projectComponentId) : undefined
    const target = requirement?.grossRequired ?? line.requestedQuantity ?? ZERO
    const allocated = line.allocationEntries.reduce((sum, entry) => sum.plus(entry.quantity), ZERO)
    const issued = line.issueLines.reduce((sum, issueLine) => sum.plus(issueLine.quantity), ZERO)
    const remaining = Prisma.Decimal.max(target.minus(line.cancelledQuantity).minus(issued), ZERO)
    const deficit = Prisma.Decimal.max(remaining.minus(allocated), ZERO)
    const availableStock = Prisma.Decimal.max(
      (line.component.balance?.onHand ?? ZERO).minus(line.component.balance?.allocated ?? ZERO),
      ZERO
    )
    return {
      ...line,
      targetQuantity: target,
      allocatedQuantity: allocated,
      issuedQuantity: issued,
      remainingQuantity: remaining,
      deficitQuantity: deficit,
      availableStock,
      readyToAllocate: deficit.isPositive() && availableStock.isPositive(),
      allocatableQuantity: Prisma.Decimal.min(deficit, availableStock),
      blockingDependencies: line.projectComponentId ? blockingDescendants(line.projectComponentId) : [],
      relatedPurchaseRequests: line.purchaseLinks.map((link) => ({
        linkId: link.id,
        quantity: link.quantity,
        purchaseRequestLineId: link.purchaseRequestLineId,
        purchaseRequestId: link.purchaseRequestLine.purchaseRequest.id,
        requestNo: link.purchaseRequestLine.purchaseRequest.requestNo,
        status: link.purchaseRequestLine.purchaseRequest.status,
      })),
    }
  })

  return {
    ...reservation,
    lines,
    projectBlockers: requirements.filter(
      (requirement) => requirement.isBlocker && relevantRequirementIds.has(requirement.projectComponentId)
    ),
    managerActions: {
      hasAllocatableStock: lines.some((line) => line.readyToAllocate),
      mayIssue: lines.some((line) => line.allocatedQuantity.isPositive()),
    },
  }
}

export async function listReservationDeficits() {
  const reservations = await db.reservation.findMany({
    where: { status: { notIn: [CanonicalReservationStatus.CLOSED, CanonicalReservationStatus.CANCELLED] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  const details = await Promise.all(reservations.map((reservation) => getReservationDetail(reservation.id)))
  return details.flatMap((reservation) => reservation.lines
    .filter((line) => line.deficitQuantity.isPositive())
    .map((line) => ({
      reservationNo: reservation.reservationNo,
      status: reservation.status,
      project: reservation.project,
      department: reservation.department,
      ...line,
    })))
}
