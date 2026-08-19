import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import {
  CanonicalReservationStatus,
  ComponentDiscipline,
  ProjectComponentReconciliationStatus,
} from '@prisma/client'
import { db } from '../../src/lib/db'
import {
  allocateReservationLine,
  InventoryDomainError,
  postInventoryAdjustment,
  postPartialIssue,
} from '../../src/lib/inventory/canonical-ledger'
import { getProjectComponentRequirements } from '../../src/lib/inventory/project-requirements'

const enabled = process.env.RUN_INTEGRATION_TESTS === '1'
const run = enabled ? test : test.skip
const suffix = randomUUID().slice(0, 8)

let userId: string
let departmentId: string
let projectId: string
let componentAId: string
let componentBId: string
let projectAId: string
let projectBId: string
let reservationId: string
let reservationLineAId: string
let reservationLineBId: string

before(async () => {
  if (!enabled) return

  const user = await db.user.create({
    data: {
      email: `integration-${suffix}@localhost`,
      password: 'not-used',
      name: 'Integration Test User',
      role: 'SUPER_ADMIN',
    },
  })
  userId = user.id

  const department = await db.department.create({
    data: { name: `Integration ${suffix}`, code: `IT-${suffix}` },
  })
  departmentId = department.id

  const project = await db.project.create({
    data: {
      name: `Dependency Test ${suffix}`,
      code: `PT-${suffix}`,
      departmentId,
    },
  })
  projectId = project.id

  const [componentA, componentB] = await Promise.all([
    db.component.create({
      data: {
        code: `A-${suffix}`,
        title: 'Manufactured A',
        discipline: ComponentDiscipline.MECHANICAL,
        description: 'Parent component used by the integration test',
        createdById: userId,
      },
    }),
    db.component.create({
      data: {
        code: `B-${suffix}`,
        title: 'Standard B',
        discipline: ComponentDiscipline.ELECTRONICS,
        description: 'Child component used by the integration test',
        createdById: userId,
      },
    }),
  ])
  componentAId = componentA.id
  componentBId = componentB.id

  const projectA = await db.projectComponent.create({
    data: {
      projectId,
      componentId: componentAId,
      sourceLineKey: 'A',
      title: componentA.title,
      discipline: componentA.discipline,
      description: componentA.description,
      quantity: 10,
      reconciliationStatus: ProjectComponentReconciliationStatus.RECONCILED,
      reconciledById: userId,
      reconciledAt: new Date(),
    },
  })
  projectAId = projectA.id

  const projectB = await db.projectComponent.create({
    data: {
      projectId,
      componentId: componentBId,
      parentProjectComponentId: projectAId,
      sourceLineKey: 'B',
      title: componentB.title,
      discipline: componentB.discipline,
      description: componentB.description,
      quantity: 2,
      reconciliationStatus: ProjectComponentReconciliationStatus.RECONCILED,
      reconciledById: userId,
      reconciledAt: new Date(),
    },
  })
  projectBId = projectB.id

  await postInventoryAdjustment({
    adjustmentNo: `OPEN-${suffix}`,
    actorId: userId,
    reason: 'Integration test opening balance',
    lines: [
      { componentId: componentAId, quantity: 4 },
      { componentId: componentBId, quantity: 20 },
    ],
  })

  const request = await db.reservationRequest.create({
    data: {
      requestNo: `RRQ-${suffix}`,
      projectId,
      requestedById: userId,
      items: {
        create: [
          {
            projectComponentId: projectAId,
            componentId: componentAId,
            title: componentA.title,
            discipline: componentA.discipline,
            description: componentA.description,
            quantity: 10,
          },
          {
            projectComponentId: projectBId,
            componentId: componentBId,
            title: componentB.title,
            discipline: componentB.discipline,
            description: componentB.description,
            quantity: 2,
          },
        ],
      },
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })

  const requestA = request.items.find((item) => item.projectComponentId === projectAId)!
  const requestB = request.items.find((item) => item.projectComponentId === projectBId)!
  const reservation = await db.reservation.create({
    data: {
      reservationNo: `RSV-${suffix}`,
      requestId: request.id,
      projectId,
      convertedById: userId,
      lines: {
        create: [
          {
            requestLineId: requestA.id,
            componentId: componentAId,
            projectComponentId: projectAId,
            requestedQuantity: null,
          },
          {
            requestLineId: requestB.id,
            componentId: componentBId,
            projectComponentId: projectBId,
            requestedQuantity: null,
          },
        ],
      },
    },
    include: { lines: true },
  })
  reservationId = reservation.id
  reservationLineAId = reservation.lines.find((line) => line.componentId === componentAId)!.id
  reservationLineBId = reservation.lines.find((line) => line.componentId === componentBId)!.id
})

after(async () => {
  if (!enabled) return

  await db.stockReturnLine.deleteMany({ where: { componentId: { in: [componentAId, componentBId] } } })
  await db.stockReturn.deleteMany({ where: { returnNo: { endsWith: suffix } } })
  await db.inventoryLedgerEntry.deleteMany({ where: { componentId: { in: [componentAId, componentBId] } } })
  await db.inventoryAllocationEntry.deleteMany({
    where: { reservationLineId: { in: [reservationLineAId, reservationLineBId] } },
  })
  await db.stockIssueLine.deleteMany({ where: { componentId: { in: [componentAId, componentBId] } } })
  await db.stockIssue.deleteMany({ where: { reservationId } })
  await db.reservationLine.deleteMany({ where: { reservationId } })
  await db.reservation.deleteMany({ where: { id: reservationId } })
  await db.reservationRequestLine.deleteMany({ where: { request: { requestNo: `RRQ-${suffix}` } } })
  await db.reservationRequest.deleteMany({ where: { requestNo: `RRQ-${suffix}` } })
  await db.inventoryAdjustmentLine.deleteMany({ where: { componentId: { in: [componentAId, componentBId] } } })
  await db.inventoryAdjustment.deleteMany({ where: { adjustmentNo: `OPEN-${suffix}` } })
  await db.projectComponent.deleteMany({ where: { id: projectBId } })
  await db.projectComponent.deleteMany({ where: { id: projectAId } })
  await db.componentBalance.deleteMany({ where: { componentId: { in: [componentAId, componentBId] } } })
  await db.component.deleteMany({ where: { id: { in: [componentAId, componentBId] } } })
  await db.project.deleteMany({ where: { id: projectId } })
  await db.department.deleteMany({ where: { id: departmentId } })
  await db.user.deleteMany({ where: { id: userId } })
  await db.$disconnect()
})

run('derives child demand from uncovered parent demand', async () => {
  const initial = await getProjectComponentRequirements(projectId)
  assert.equal(initial.find((row) => row.projectComponentId === projectAId)?.grossRequired.toString(), '10')
  assert.equal(initial.find((row) => row.projectComponentId === projectBId)?.grossRequired.toString(), '20')

  await allocateReservationLine({
    reservationLineId: reservationLineAId,
    quantity: 4,
    actorId: userId,
    sourceId: `ALLOC-A-${suffix}`,
  })

  const afterAllocation = await getProjectComponentRequirements(projectId)
  const parent = afterAllocation.find((row) => row.projectComponentId === projectAId)!
  const child = afterAllocation.find((row) => row.projectComponentId === projectBId)!
  assert.equal(parent.uncoveredQuantity.toString(), '6')
  assert.equal(child.grossRequired.toString(), '12')
})

run('supports arbitrary partial issues without losing parent coverage', async () => {
  await allocateReservationLine({
    reservationLineId: reservationLineBId,
    quantity: 12,
    actorId: userId,
    sourceId: `ALLOC-B-${suffix}`,
  })

  await postPartialIssue({
    issueNo: `ISS-1-${suffix}`,
    reservationId,
    actorId: userId,
    lines: [
      { reservationLineId: reservationLineAId, quantity: 2 },
      { reservationLineId: reservationLineBId, quantity: 5 },
    ],
  })

  const requirements = await getProjectComponentRequirements(projectId)
  const parent = requirements.find((row) => row.projectComponentId === projectAId)!
  const child = requirements.find((row) => row.projectComponentId === projectBId)!
  assert.equal(parent.allocatedQuantity.toString(), '2')
  assert.equal(parent.issuedQuantity.toString(), '2')
  assert.equal(parent.uncoveredQuantity.toString(), '6')
  assert.equal(child.grossRequired.toString(), '12')
  assert.equal(child.allocatedQuantity.toString(), '7')
  assert.equal(child.issuedQuantity.toString(), '5')
  assert.equal(child.uncoveredQuantity.toString(), '0')

  const reservation = await db.reservation.findUniqueOrThrow({ where: { id: reservationId } })
  assert.equal(reservation.status, CanonicalReservationStatus.PARTIALLY_ISSUED)

  await assert.rejects(
    postPartialIssue({
      issueNo: `ISS-OVER-${suffix}`,
      reservationId,
      actorId: userId,
      lines: [{ reservationLineId: reservationLineBId, quantity: 8 }],
    }),
    (error: unknown) =>
      error instanceof InventoryDomainError && error.code === 'INSUFFICIENT_ALLOCATION'
  )

  const failedIssue = await db.stockIssue.findUnique({ where: { issueNo: `ISS-OVER-${suffix}` } })
  assert.equal(failedIssue, null, 'the failed issue transaction must be rolled back completely')
})
