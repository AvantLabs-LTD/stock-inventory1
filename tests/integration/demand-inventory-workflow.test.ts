import test from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"
import { adjustInventory, approveDemandLine, cancelDemandLine, createDemand, issueDemand, returnIssuedStock } from "../../src/lib/inventory-service"
import { postGoodsReceipt } from "../../src/lib/purchase-service"

const enabled = Boolean(process.env.DATABASE_URL)
const prisma = new PrismaClient()

test("approval derives allocation; issue and both return dispositions preserve balances and history", { skip: !enabled }, async () => {
  const suffix = Date.now().toString()
  const user = await prisma.user.create({ data: { email: "workflow-" + suffix + "@test.local", name: "Workflow Test", password: "not-used", role: "INVENTORY_MANAGER" } })
  const item = await prisma.item.create({ data: {
    code: "TEST-" + suffix, title: "Workflow item", discipline: "MECHANICAL",
    createdById: user.id,
    balance: { create: { onHand: 10 } },
  } })
  const demand = await createDemand({ requestedById: user.id, lines: [{ itemId: item.id, quantity: 6 }] })
  const lineId = demand!.lines[0].id
  await approveDemandLine({ lineId, actorId: user.id, actorName: user.name, approvedQuantity: 5, fromStockQuantity: 3, forProcurementQuantity: 2 })
  const afterApproval = await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })
  assert.equal(afterApproval.onHand.toString(), "10")
  assert.equal(afterApproval.reserved.toString(), "3")
  const issue = await issueDemand({ demandId: demand!.id, actorId: user.id, actorName: user.name, idempotencyKey: "issue-" + suffix, lines: [{ demandLineId: lineId, quantity: 2 }] })
  assert.equal((await issueDemand({ demandId: demand!.id, actorId: user.id, actorName: user.name, idempotencyKey: "issue-" + suffix, lines: [{ demandLineId: lineId, quantity: 2 }] }))!.id, issue!.id)
  await assert.rejects(
    issueDemand({ demandId: demand!.id, actorId: user.id, actorName: user.name, idempotencyKey: "issue-" + suffix, lines: [{ demandLineId: lineId, quantity: 1 }] }),
    /different issue details/,
  )
  const afterIssue = await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })
  assert.equal(afterIssue.onHand.toString(), "8")
  assert.equal(afterIssue.reserved.toString(), "1")
  assert.equal(await prisma.inventoryLedgerEntry.count({ where: { itemId: item.id, type: "ISSUE" } }), 1)
  await returnIssuedStock({ actorId: user.id, actorName: user.name, idempotencyKey: "replace-return-" + suffix, reason: "Defective", lines: [{ issueLineId: issue!.lines[0].id, quantity: 1, disposition: "REPLACEMENT_REQUIRED" }] })
  const afterReplacementReturn = await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })
  assert.equal(afterReplacementReturn.onHand.toString(), "9")
  assert.equal(afterReplacementReturn.reserved.toString(), "2")
  await returnIssuedStock({ actorId: user.id, actorName: user.name, idempotencyKey: "reduce-return-" + suffix, reason: "Requirement reduced", lines: [{ issueLineId: issue!.lines[0].id, quantity: 1, disposition: "REDUCE_APPROVED_QUANTITY" }] })
  const afterReductionReturn = await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })
  assert.equal(afterReductionReturn.onHand.toString(), "10")
  assert.equal(afterReductionReturn.reserved.toString(), "2")
  const quantities = await prisma.$queryRaw<Array<{ approved: { toString(): string }; allocated: { toString(): string }; netIssued: { toString(): string } }>>`
    SELECT approved,allocated,"netIssued" FROM "demand_line_quantities" WHERE "demandLineId"=${lineId}
  `
  assert.equal(quantities[0].approved.toString(), "4")
  assert.equal(quantities[0].allocated.toString(), "2")
  assert.equal(quantities[0].netIssued.toString(), "0")
  assert.equal(await prisma.demandApprovalRevision.count({ where: { demandLineId: lineId, type: "RETURN_NO_REPLACEMENT" } }), 1)

  await cancelDemandLine({
    lineId, actorId: user.id, actorName: user.name, quantity: 4, fromStockQuantity: 2, forProcurementQuantity: 2,
    reason: "Remaining need withdrawn", idempotencyKey: "cancel-" + suffix,
  })
  const afterCancellation = await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })
  assert.equal(afterCancellation.reserved.toString(), "0")
  assert.equal((await prisma.demand.findUniqueOrThrow({ where: { id: demand!.id } })).state, "CANCELLED")
})

test("unlinked intake and reduction post immutable adjustment movements", { skip: !enabled }, async () => {
  const suffix = Date.now().toString() + "-adjustment"
  const user = await prisma.user.create({ data: { email: "adjustment-" + suffix + "@test.local", name: "Adjustment Test", password: "not-used", role: "INVENTORY_MANAGER" } })
  const item = await prisma.item.create({ data: {
    code: "ADJ-TEST-" + suffix, title: "Adjustment item", discipline: "MECHANICAL",
    createdById: user.id,
    balance: { create: { onHand: 5, reserved: 2 } },
  } })

  await adjustInventory({
    actorId: user.id, actorName: user.name, idempotencyKey: "intake-" + suffix,
    reason: "Stock intake without purchase request", remarks: "Delivery note DN-100",
    lines: [{ itemId: item.id, quantity: 4 }],
  })
  await adjustInventory({
    actorId: user.id, actorName: user.name, idempotencyKey: "reduction-" + suffix,
    reason: "Damaged during inspection", remarks: "Damage report DR-100",
    lines: [{ itemId: item.id, quantity: -3 }],
  })

  const balance = await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })
  assert.equal(balance.onHand.toString(), "6")
  assert.equal(balance.reserved.toString(), "2")
  const movements = await prisma.inventoryLedgerEntry.findMany({ where: { itemId: item.id }, orderBy: { occurredAt: "asc" } })
  assert.deepEqual(movements.map(row => row.type), ["ADJUSTMENT_IN", "ADJUSTMENT_OUT"])
  assert.match(movements[0].remarks || "", /without purchase request/)
  assert.match(movements[1].remarks || "", /Damaged during inspection/)

  await assert.rejects(
    adjustInventory({ actorId: user.id, actorName: user.name, idempotencyKey: "over-reduction-" + suffix, reason: "Invalid count", lines: [{ itemId: item.id, quantity: -5 }] }),
    /reserved/,
  )
  const afterRejected = await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })
  assert.equal(afterRejected.onHand.toString(), "6")
  assert.equal(await prisma.inventoryAdjustment.count({ where: { idempotencyKey: "over-reduction-" + suffix } }), 0)
})

test("a full no-replacement return cancels the approved demand without erasing history", { skip: !enabled }, async () => {
  const suffix = Date.now().toString() + "-full-return"
  const user = await prisma.user.create({ data: { email: "full-return-" + suffix + "@test.local", name: "Full Return Test", password: "not-used", role: "INVENTORY_MANAGER" } })
  const item = await prisma.item.create({ data: { code: "FULL-RETURN-" + suffix, title: "Full return item", discipline: "MECHANICAL", createdById: user.id, balance: { create: { onHand: 2 } } } })
  const demand = await createDemand({ requestedById: user.id, lines: [{ itemId: item.id, quantity: 2 }] })
  const lineId = demand!.lines[0].id
  await approveDemandLine({ lineId, actorId: user.id, actorName: user.name, approvedQuantity: 2, fromStockQuantity: 2, forProcurementQuantity: 0 })
  const issue = await issueDemand({ demandId: demand!.id, actorId: user.id, actorName: user.name, idempotencyKey: "full-issue-" + suffix, lines: [{ demandLineId: lineId, quantity: 2 }] })
  await returnIssuedStock({ actorId: user.id, actorName: user.name, idempotencyKey: "full-return-" + suffix, reason: "Requirement withdrawn", lines: [{ issueLineId: issue!.lines[0].id, quantity: 2, disposition: "REDUCE_APPROVED_QUANTITY" }] })

  const current = await prisma.demand.findUniqueOrThrow({ where: { id: demand!.id } })
  const facts = await prisma.$queryRaw<Array<{ approved: { toString(): string }; netIssued: { toString(): string }; fulfilmentFacet: string }>>`
    SELECT approved,"netIssued","fulfilmentFacet" FROM "demand_line_quantities" WHERE "demandLineId"=${lineId}
  `
  assert.equal(current.state, "CANCELLED")
  assert.equal(facts[0].approved.toString(), "0")
  assert.equal(facts[0].netIssued.toString(), "0")
  assert.equal(facts[0].fulfilmentFacet, "CANCELLED")
  assert.equal(await prisma.demandIssueLine.count({ where: { demandLineId: lineId } }), 1)
  assert.equal(await prisma.demandReturnLine.count({ where: { issueLine: { demandLineId: lineId } } }), 1)
})

test("goods receipts are partial, repeatable, idempotent, and close only when fully received", { skip: !enabled }, async () => {
  const suffix = Date.now().toString() + "-receipt"
  const user = await prisma.user.create({ data: {
    email: "receipt-" + suffix + "@test.local",
    name: "Receipt Test",
    password: "not-used",
    role: "INVENTORY_MANAGER",
  } })
  const item = await prisma.item.create({ data: {
    code: "RECEIPT-TEST-" + suffix,
    title: "Receipt item",
    discipline: "MECHANICAL",
    createdById: user.id,
    balance: { create: { onHand: 0 } },
  } })
  const purchase = await prisma.purchaseRequest.create({ data: {
    requestNo: "PUR-TEST-" + suffix,
    status: "ORDERED",
    createdById: user.id,
    lines: { create: { itemId: item.id, type: "LOCAL_STANDARD", quantity: 5 } },
  }, include: { lines: true } })
  const purchaseLineId = purchase.lines[0].id

  const firstInput = {
    purchaseRequestId: purchase.id,
    actorId: user.id,
    actorName: user.name,
    idempotencyKey: "receipt-first-" + suffix,
    lines: [{ purchaseRequestLineId: purchaseLineId, quantity: 2 }],
  }
  const first = await postGoodsReceipt(firstInput)
  const replay = await postGoodsReceipt(firstInput)
  assert.equal(replay.id, first.id)
  await assert.rejects(postGoodsReceipt({ ...firstInput, lines: [{ purchaseRequestLineId: purchaseLineId, quantity: 1 }] }), /different receipt details/)
  assert.equal((await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })).onHand.toString(), "2")
  assert.equal((await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: purchase.id } })).status, "ORDERED")

  const second = await postGoodsReceipt({
    purchaseRequestId: purchase.id,
    actorId: user.id,
    actorName: user.name,
    idempotencyKey: "receipt-final-" + suffix,
    lines: [{ purchaseRequestLineId: purchaseLineId, quantity: 3 }],
  })
  assert.equal((await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })).onHand.toString(), "5")
  assert.equal((await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: purchase.id } })).status, "RECEIVED_IN_STORE")
  assert.equal(await prisma.inventoryLedgerEntry.count({ where: { itemId: item.id, type: "RECEIPT" } }), 2)
  assert.equal(await prisma.auditLog.count({ where: { entityId: { in: [first.id, second.id] }, entityType: "GoodsReceipt", action: "POST_GOODS_RECEIPT" } }), 2)
})

test("goods receipt validation rejects empty and duplicate rows before posting", async () => {
  const base = { purchaseRequestId: "not-used", actorId: "not-used", actorName: "Test" }
  await assert.rejects(postGoodsReceipt({ ...base, lines: [] }), /At least one receipt row/)
  await assert.rejects(postGoodsReceipt({
    ...base,
    lines: [
      { purchaseRequestLineId: "same-line", quantity: 1 },
      { purchaseRequestLineId: "same-line", quantity: 1 },
    ],
  }), /only once/)
})

test.after(async () => prisma.$disconnect())
