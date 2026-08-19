import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { CanonicalReservationStatus, ComponentDiscipline } from '@prisma/client'
import { db } from '../../src/lib/db'
import {
  allocateReservationLine,
  postInventoryAdjustment,
  postPartialIssue,
} from '../../src/lib/inventory/canonical-ledger'
import {
  convertReservationRequest,
  createReservationRequest,
  getReservationDetail,
  reconcileReservationRequestLine,
  ReservationDomainError,
} from '../../src/lib/inventory/reservation-service'
import { ROLES } from '../../src/lib/permissions'

const enabled = process.env.RUN_INTEGRATION_TESTS === '1'
const run = enabled ? test : test.skip
const suffix = randomUUID().slice(0, 8)

let userId: string
let departmentId: string
let otherDepartmentId: string
let requestId: string
let requestLineId: string
let componentId: string
let reservationId: string
let reservationLineId: string

before(async () => {
  if (!enabled) return
  const department = await db.department.create({ data: { name: `Reservation Dept ${suffix}`, code: `RSV-D-${suffix}` } })
  departmentId = department.id
  const other = await db.department.create({ data: { name: `Other Reservation Dept ${suffix}`, code: `RSV-O-${suffix}` } })
  otherDepartmentId = other.id
  const user = await db.user.create({
    data: {
      email: `reservation-${suffix}@localhost`,
      password: 'not-used',
      name: 'Reservation Integration Manager',
      role: ROLES.INVENTORY_MANAGER,
      departmentId,
    },
  })
  userId = user.id
})

after(async () => {
  if (!enabled) return
  if (componentId) {
    await db.inventoryLedgerEntry.deleteMany({ where: { componentId } })
    await db.inventoryAllocationEntry.deleteMany({ where: { reservationLineId } })
    await db.stockIssueLine.deleteMany({ where: { componentId } })
    await db.stockIssue.deleteMany({ where: { reservationId } })
    await db.reservationLine.deleteMany({ where: { reservationId } })
    await db.reservation.deleteMany({ where: { id: reservationId } })
    await db.inventoryAdjustmentLine.deleteMany({ where: { componentId } })
    await db.inventoryAdjustment.deleteMany({ where: { adjustmentNo: `RSV-OPEN-${suffix}` } })
  }
  if (requestId) {
    await db.reservationRequestLine.deleteMany({ where: { requestId } })
    await db.reservationRequest.deleteMany({ where: { id: requestId } })
  }
  if (componentId) {
    await db.componentBalance.deleteMany({ where: { componentId } })
    await db.component.deleteMany({ where: { id: componentId } })
  }
  await db.user.deleteMany({ where: { id: userId } })
  await db.department.deleteMany({ where: { id: { in: [departmentId, otherDepartmentId] } } })
  await db.$disconnect()
})

run('enforces a regular user department boundary', async () => {
  await assert.rejects(
    createReservationRequest({
      departmentId: otherDepartmentId,
      requestedById: userId,
      requesterDepartmentId: departmentId,
      mayRequestForAnyDepartment: false,
      items: [{
        title: 'Boundary check component',
        discipline: ComponentDiscipline.MECHANICAL,
        description: 'Must not be submitted to another department',
        quantity: 1,
      }],
    }),
    (error: unknown) => error instanceof ReservationDomainError && error.code === 'FORBIDDEN'
  )
})

run('reconciles, converts, allocates, and repeatedly issues partial quantities', async () => {
  const request = await createReservationRequest({
    departmentId,
    requestedById: userId,
    requesterDepartmentId: departmentId,
    mayRequestForAnyDepartment: false,
    remarks: 'Integration reservation request',
    items: [{
      title: 'Requested integration component',
      discipline: ComponentDiscipline.ELECTRONICS,
      description: 'Unreconciled user description',
      function: 'Validate the reservation workflow',
      quantity: 6,
    }],
  })
  assert.ok(request)
  requestId = request!.id
  requestLineId = request!.items[0].id

  await assert.rejects(
    convertReservationRequest({ requestId, actorId: userId }),
    (error: unknown) => error instanceof ReservationDomainError && error.code === 'UNRECONCILED'
  )

  const reconciled = await reconcileReservationRequestLine({
    requestId,
    lineId: requestLineId,
    actorId: userId,
    createComponent: { code: `RSV-C-${suffix}`, unit: 'pcs' },
  })
  componentId = reconciled.componentId!

  await postInventoryAdjustment({
    adjustmentNo: `RSV-OPEN-${suffix}`,
    actorId: userId,
    reason: 'Integration opening stock',
    lines: [{ componentId, quantity: 10 }],
  })

  const reservation = await convertReservationRequest({ requestId, actorId: userId })
  reservationId = reservation.id
  reservationLineId = reservation.lines[0].id

  const initial = await getReservationDetail(reservationId)
  assert.equal(initial.lines[0].targetQuantity.toString(), '6')
  assert.equal(initial.lines[0].deficitQuantity.toString(), '6')
  assert.equal(initial.lines[0].readyToAllocate, true)
  assert.equal(initial.managerActions.hasAllocatableStock, true)

  await allocateReservationLine({
    reservationId,
    reservationLineId,
    quantity: 4,
    actorId: userId,
    sourceId: `RSV-ALLOC-${suffix}`,
  })
  await postPartialIssue({
    issueNo: `RSV-ISS-1-${suffix}`,
    reservationId,
    actorId: userId,
    lines: [{ reservationLineId, quantity: 1 }],
  })
  await postPartialIssue({
    issueNo: `RSV-ISS-2-${suffix}`,
    reservationId,
    actorId: userId,
    lines: [{ reservationLineId, quantity: 2 }],
  })

  const final = await getReservationDetail(reservationId)
  assert.equal(final.status, CanonicalReservationStatus.PARTIALLY_ISSUED)
  assert.equal(final.lines[0].issuedQuantity.toString(), '3')
  assert.equal(final.lines[0].allocatedQuantity.toString(), '1')
  assert.equal(final.lines[0].remainingQuantity.toString(), '3')
  assert.equal(final.lines[0].deficitQuantity.toString(), '2')
  assert.equal(final.issues.length, 2)
})
