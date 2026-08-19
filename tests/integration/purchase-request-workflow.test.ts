import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { ComponentDiscipline, PurchaseRequestStatus, PurchaseRequestType } from '@prisma/client'
import { db } from '../../src/lib/db'
import { InventoryDomainError, postGoodsReceipt } from '../../src/lib/inventory/canonical-ledger'
import { createPurchaseRequest, getPurchaseRequest, PurchaseRequestDomainError, transitionPurchaseRequest } from '../../src/lib/inventory/purchase-request-service'
import { ROLES } from '../../src/lib/permissions'

const enabled = process.env.RUN_INTEGRATION_TESTS === '1'
const run = enabled ? test : test.skip
const suffix = randomUUID().slice(0, 8)
let managerId = ''
let approverId = ''
let departmentId = ''
let componentId = ''
let requestId = ''
let reservationId = ''
let purchaseRequestId = ''

before(async () => {
  if (!enabled) return
  const department = await db.department.create({ data: { name: `Purchase Dept ${suffix}`, code: `PR-D-${suffix}` } })
  departmentId = department.id
  const [manager, approver] = await Promise.all([
    db.user.create({ data: { email: `pr-manager-${suffix}@localhost`, password: 'not-used', name: 'Purchase Manager', role: ROLES.INVENTORY_MANAGER, departmentId } }),
    db.user.create({ data: { email: `pr-approver-${suffix}@localhost`, password: 'not-used', name: 'Purchase Approver', role: ROLES.PURCHASE_APPROVER, departmentId } }),
  ])
  managerId = manager.id; approverId = approver.id
  const component = await db.component.create({ data: { code: `PR-C-${suffix}`, title: 'Purchase workflow component', discipline: ComponentDiscipline.MECHANICAL, description: 'Integration purchase component', createdById: managerId, balance: { create: {} } } })
  componentId = component.id
  const request = await db.reservationRequest.create({
    data: {
      requestNo: `PR-RRQ-${suffix}`, departmentId, requestedById: managerId,
      items: { create: { componentId, title: component.title, discipline: component.discipline, description: component.description, quantity: 5 } },
    }, include: { items: true },
  })
  requestId = request.id
  const reservation = await db.reservation.create({
    data: { reservationNo: `PR-RSV-${suffix}`, requestId, departmentId, convertedById: managerId, lines: { create: { requestLineId: request.items[0].id, componentId, requestedQuantity: 5 } } },
  })
  reservationId = reservation.id
  await db.reservationRequest.update({ where: { id: requestId }, data: { status: 'CONVERTED' } })
})

after(async () => {
  if (!enabled) return
  await db.inventoryLedgerEntry.deleteMany({ where: { componentId } })
  await db.goodsReceiptLine.deleteMany({ where: { componentId } })
  await db.goodsReceipt.deleteMany({ where: { purchaseRequestId } })
  await db.purchaseReservationLink.deleteMany({ where: { purchaseRequestLine: { purchaseRequestId } } })
  await db.purchaseRequestLine.deleteMany({ where: { purchaseRequestId } })
  await db.purchaseRequest.deleteMany({ where: { id: purchaseRequestId } })
  await db.reservationLine.deleteMany({ where: { reservationId } })
  await db.reservation.deleteMany({ where: { id: reservationId } })
  await db.reservationRequestLine.deleteMany({ where: { requestId } })
  await db.reservationRequest.deleteMany({ where: { id: requestId } })
  await db.componentBalance.deleteMany({ where: { componentId } })
  await db.component.deleteMany({ where: { id: componentId } })
  await db.user.deleteMany({ where: { id: { in: [managerId, approverId] } } })
  await db.department.deleteMany({ where: { id: departmentId } })
  await db.$disconnect()
})

run('auto-links deficits and enforces the purchase approval lifecycle through receipt', async () => {
  const purchase = await createPurchaseRequest({
    actorId: managerId,
    lines: [{ componentId, type: PurchaseRequestType.LOCAL_STANDARD, quantity: 5 }],
  })
  assert.ok(purchase)
  purchaseRequestId = purchase!.id
  assert.equal(purchase!.lines[0].reservationLinks.length, 1)
  assert.equal(purchase!.lines[0].reservationLinks[0].quantity.toString(), '5')

  await transitionPurchaseRequest({ id: purchaseRequestId, target: PurchaseRequestStatus.PENDING_ORDER_APPROVAL, actorId: managerId, actorMayManage: true, actorMayOrder: false })
  await assert.rejects(
    transitionPurchaseRequest({ id: purchaseRequestId, target: PurchaseRequestStatus.ORDERED, actorId: managerId, actorMayManage: true, actorMayOrder: false }),
    (error: unknown) => error instanceof PurchaseRequestDomainError && error.code === 'FORBIDDEN'
  )
  await transitionPurchaseRequest({ id: purchaseRequestId, target: PurchaseRequestStatus.ORDERED, actorId: approverId, actorMayManage: false, actorMayOrder: true })
  await transitionPurchaseRequest({ id: purchaseRequestId, target: PurchaseRequestStatus.SHIPPED, actorId: managerId, actorMayManage: true, actorMayOrder: false })

  const lineId = purchase!.lines[0].id
  await postGoodsReceipt({ receiptNo: `PR-GR-1-${suffix}`, purchaseRequestId, actorId: managerId, lines: [{ purchaseRequestLineId: lineId, componentId, quantity: 2 }] })
  assert.equal((await db.purchaseRequest.findUniqueOrThrow({ where: { id: purchaseRequestId } })).status, PurchaseRequestStatus.SHIPPED)
  await assert.rejects(
    postGoodsReceipt({ receiptNo: `PR-GR-OVER-${suffix}`, purchaseRequestId, actorId: managerId, lines: [{ purchaseRequestLineId: lineId, componentId, quantity: 4 }] }),
    (error: unknown) => error instanceof InventoryDomainError && error.code === 'OVER_FULFILLMENT'
  )
  await postGoodsReceipt({ receiptNo: `PR-GR-2-${suffix}`, purchaseRequestId, actorId: managerId, lines: [{ purchaseRequestLineId: lineId, componentId, quantity: 3 }] })
  const final = await getPurchaseRequest(purchaseRequestId)
  assert.equal(final.status, PurchaseRequestStatus.RECEIVED_IN_STORE)
  assert.equal(final.lines[0].receivedQuantity.toString(), '5')
  assert.equal((await db.componentBalance.findUniqueOrThrow({ where: { componentId } })).onHand.toString(), '5')
})
