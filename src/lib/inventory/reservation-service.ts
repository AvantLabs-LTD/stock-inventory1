import { randomUUID } from 'node:crypto'
import {
  Prisma,
  ProjectBomUploadStatus,
  ProjectComponentReconciliationStatus,
  ReservationRequestStatus,
} from '@prisma/client'
import { db } from '@/lib/db'

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
        const line = await tx.projectComponent.findFirst({
          where: {
            id: item.projectComponentId,
            projectId: input.projectId!,
            bomUpload: { status: ProjectBomUploadStatus.ACCEPTED },
          },
        })
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

export async function convertReservationRequest(input: {
  requestId: string
  actorId: string
  bomVersionId?: string
  setCount?: number
}) {
  return db.$transaction(async (tx) => {
    const request = await tx.reservationRequest.findUnique({ where: { id: input.requestId }, include: { items: true } })
    if (!request) throw new ReservationDomainError('Reservation request was not found', 'NOT_FOUND')
    if (request.status !== ReservationRequestStatus.SUBMITTED) {
      throw new ReservationDomainError('Only submitted requests can be converted', 'INVALID_STATE')
    }
    if (request.items.length === 0 || request.items.some((line) => !line.componentId)) {
      throw new ReservationDomainError('Every request line must be reconciled before conversion', 'UNRECONCILED')
    }

    let bomVersion: Prisma.ProjectBomUploadGetPayload<{ include: { lines: true } }> | null = null
    if (request.projectId) {
      if (!input.bomVersionId || !input.setCount || input.setCount <= 0) {
        throw new ReservationDomainError('A project cycle requires an accepted BOM version and positive set count', 'INVALID_STATE')
      }
      bomVersion = await tx.projectBomUpload.findFirst({
        where: {
          id: input.bomVersionId,
          projectId: request.projectId,
          status: ProjectBomUploadStatus.ACCEPTED,
        },
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
      })
      if (!bomVersion) throw new ReservationDomainError('The accepted BOM version was not found', 'NOT_FOUND')
      if (!bomVersion.lines?.length || bomVersion.lines.some((line) => !line.componentId)) {
        throw new ReservationDomainError('Every BOM line must be reconciled before cycle conversion', 'UNRECONCILED')
      }
      const bomLineIds = new Set(bomVersion.lines.map((line) => line.id))
      if (request.items.some((line) => line.projectComponentId && !bomLineIds.has(line.projectComponentId))) {
        throw new ReservationDomainError('A requested BOM line does not belong to the selected accepted version', 'INVALID_STATE')
      }
    } else if (input.bomVersionId || input.setCount) {
      throw new ReservationDomainError('Department reservations cannot bind a BOM version or set count', 'INVALID_STATE')
    }

    const requestLineByBomLine = new Map(
      request.items
        .filter((line) => line.projectComponentId)
        .map((line) => [line.projectComponentId!, line])
    )
    const directRequestLines = request.items.filter((line) => !line.projectComponentId)
    const cycleLines = (bomVersion?.lines ?? []).map((line) => ({
      requestLineId: requestLineByBomLine.get(line.id)?.id,
      componentId: line.componentId!,
      projectComponentId: line.id,
      requestedQuantity: null,
      remarks: requestLineByBomLine.get(line.id)?.remarks,
    }))
    const directLines = directRequestLines.map((line) => ({
      requestLineId: line.id,
      componentId: line.componentId!,
      projectComponentId: null,
      requestedQuantity: line.quantity,
      remarks: line.remarks,
    }))

    const reservation = await tx.reservation.create({
      data: {
        reservationNo: generatedNo('RSV'),
        requestId: request.id,
        projectId: request.projectId,
        departmentId: request.departmentId,
        bomVersionId: bomVersion?.id,
        setCount: request.projectId ? input.setCount : undefined,
        convertedById: input.actorId,
        remarks: request.remarks,
        lines: {
          create: [...cycleLines, ...directLines],
        },
      },
      include: { lines: true },
    })
    await tx.reservationRequest.update({ where: { id: request.id }, data: { status: ReservationRequestStatus.CONVERTED } })
    return reservation
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

type RequirementProjection = {
  reservationLineId: string
  reservationId: string
  componentId: string
  projectComponentId: string | null
  parentProjectComponentId: string | null
  depth: number
  path: string[]
  requiredQuantity: Prisma.Decimal
  cancelledQuantity: Prisma.Decimal
  allocatedQuantity: Prisma.Decimal
  netIssuedQuantity: Prisma.Decimal
  manufacturingUncoveredQuantity: Prisma.Decimal
  remainingQuantity: Prisma.Decimal
  unallocatedDemand: Prisma.Decimal
  title: string | null
  description: string | null
}

type SupplyProjection = RequirementProjection & {
  componentFreeStock: Prisma.Decimal
  assignableFreeStock: Prisma.Decimal
  physicalStockDeficit: Prisma.Decimal
  backlogQuantity: Prisma.Decimal
  pendingApprovalQuantity: Prisma.Decimal
  orderedQuantity: Prisma.Decimal
  shippedQuantity: Prisma.Decimal
  unprocuredDeficit: Prisma.Decimal
}

export async function getReservationDetail(reservationId: string) {
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    include: {
      project: true,
      department: true,
      bomVersion: { select: { id: true, versionNumber: true, fileName: true, status: true } },
      request: { include: { requestedBy: { select: { id: true, name: true, email: true } } } },
      issues: { include: { lines: true }, orderBy: { postedAt: 'asc' } },
      lines: {
        include: {
          component: { include: { balance: true } },
          projectComponent: true,
          allocationEntries: { orderBy: { createdAt: 'asc' } },
          cancellationEntries: { orderBy: { createdAt: 'asc' } },
          issueLines: { include: { returnLines: true } },
          purchaseLinks: { include: { purchaseRequestLine: { include: { purchaseRequest: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!reservation) throw new ReservationDomainError('Reservation was not found', 'NOT_FOUND')

  const [requirements, supply] = await Promise.all([
    db.$queryRaw<RequirementProjection[]>`
      SELECT requirement.*, component."title", component."description"
      FROM "reservation_line_requirements" requirement
      LEFT JOIN "project_components" component
        ON component."id" = requirement."projectComponentId"
      WHERE requirement."reservationId" = ${reservation.id}
      ORDER BY requirement."depth", requirement."reservationLineId"
    `,
    db.$queryRaw<SupplyProjection[]>`
      SELECT supply.*, component."title", component."description"
      FROM "reservation_line_supply" supply
      LEFT JOIN "project_components" component
        ON component."id" = supply."projectComponentId"
      WHERE supply."reservationId" = ${reservation.id}
    `,
  ])
  const requirementByLineId = new Map(requirements.map((item) => [item.reservationLineId, item]))
  const supplyByLineId = new Map(supply.map((item) => [item.reservationLineId, item]))
  const children = new Map<string, RequirementProjection[]>()
  for (const item of requirements) {
    if (!item.parentProjectComponentId) continue
    children.set(item.parentProjectComponentId, [...(children.get(item.parentProjectComponentId) ?? []), item])
  }
  function blockingDescendants(id: string) {
    const result: Array<RequirementProjection & { physicalStockDeficit: Prisma.Decimal }> = []
    const pending = [...(children.get(id) ?? [])]
    while (pending.length) {
      const child = pending.shift()!
      const childSupply = supplyByLineId.get(child.reservationLineId)
      if (childSupply?.physicalStockDeficit.isPositive()) {
        result.push({ ...child, physicalStockDeficit: childSupply.physicalStockDeficit })
      }
      if (child.projectComponentId) pending.push(...(children.get(child.projectComponentId) ?? []))
    }
    return result
  }
  const relevantRequirementIds = new Set<string>()
  for (const line of reservation.lines) {
    if (!line.projectComponentId) continue
    relevantRequirementIds.add(line.projectComponentId)
    for (const blocker of blockingDescendants(line.projectComponentId)) {
      if (blocker.projectComponentId) relevantRequirementIds.add(blocker.projectComponentId)
    }
  }

  const lines = reservation.lines.map((line) => {
    const requirement = requirementByLineId.get(line.id)
    const lineSupply = supplyByLineId.get(line.id)
    const target = requirement?.requiredQuantity ?? line.requestedQuantity ?? ZERO
    const cancelled = requirement?.cancelledQuantity ?? ZERO
    const allocated = requirement?.allocatedQuantity ?? ZERO
    const issued = requirement?.netIssuedQuantity ?? ZERO
    const remaining = requirement?.remainingQuantity ?? Prisma.Decimal.max(target.minus(cancelled).minus(issued), ZERO)
    const unallocatedDemand = requirement?.unallocatedDemand ?? Prisma.Decimal.max(remaining.minus(allocated), ZERO)
    const availableStock = Prisma.Decimal.max(
      (line.component.balance?.onHand ?? ZERO).minus(line.component.balance?.allocated ?? ZERO),
      ZERO
    )
    const activeRequirement = Prisma.Decimal.max(target.minus(cancelled), ZERO)
    const fulfilmentFacet = cancelled.greaterThanOrEqualTo(target)
      ? 'CANCELLED'
      : issued.greaterThanOrEqualTo(activeRequirement)
        ? 'ISSUED'
        : issued.isPositive()
          ? 'PARTIALLY_ISSUED'
          : allocated.greaterThanOrEqualTo(remaining)
            ? 'AVAILABLE'
            : 'PENDING'
    return {
      ...line,
      targetQuantity: target,
      cancelledQuantity: cancelled,
      allocatedQuantity: allocated,
      issuedQuantity: issued,
      remainingQuantity: remaining,
      unallocatedDemand,
      assignableFreeStock: lineSupply?.assignableFreeStock ?? ZERO,
      physicalStockDeficit: lineSupply?.physicalStockDeficit ?? ZERO,
      unprocuredDeficit: lineSupply?.unprocuredDeficit ?? ZERO,
      deficitQuantity: lineSupply?.physicalStockDeficit ?? ZERO,
      backlogQuantity: lineSupply?.backlogQuantity ?? ZERO,
      pendingApprovalQuantity: lineSupply?.pendingApprovalQuantity ?? ZERO,
      orderedQuantity: lineSupply?.orderedQuantity ?? ZERO,
      shippedQuantity: lineSupply?.shippedQuantity ?? ZERO,
      fulfilmentFacet,
      availableStock,
      readyToAllocate: unallocatedDemand.isPositive() && availableStock.isPositive(),
      allocatableQuantity: Prisma.Decimal.min(unallocatedDemand, availableStock),
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
    projectBlockers: supply.filter((item) =>
      item.projectComponentId
      && item.physicalStockDeficit.isPositive()
      && relevantRequirementIds.has(item.projectComponentId)
    ),
    managerActions: {
      hasAllocatableStock: lines.some((line) => line.readyToAllocate),
      mayIssue: lines.some((line) => line.allocatedQuantity.isPositive()),
    },
  }
}

export async function listReservationDeficits() {
  const deficits = await db.$queryRaw<SupplyProjection[]>`
    SELECT supply.*, component."title", component."description"
    FROM "reservation_line_supply" supply
    LEFT JOIN "project_components" component ON component."id" = supply."projectComponentId"
    WHERE supply."physicalStockDeficit" > 0
    ORDER BY supply."reservationCreatedAt", supply."reservationNo", supply."reservationLineId"
  `
  const lines = await db.reservationLine.findMany({
    where: { id: { in: deficits.map((item) => item.reservationLineId) } },
    include: {
      component: true,
      reservation: { include: { project: true, department: true, request: { select: { requestNo: true } }, bomVersion: true } },
      purchaseLinks: { include: { purchaseRequestLine: { include: { purchaseRequest: true } } } },
    },
  })
  const lineById = new Map(lines.map((line) => [line.id, line]))
  return deficits.map((deficit) => ({
    ...lineById.get(deficit.reservationLineId),
    ...deficit,
    deficitQuantity: deficit.physicalStockDeficit,
    project: lineById.get(deficit.reservationLineId)?.reservation.project,
    department: lineById.get(deficit.reservationLineId)?.reservation.department,
    status: lineById.get(deficit.reservationLineId)?.reservation.status,
  }))
}
