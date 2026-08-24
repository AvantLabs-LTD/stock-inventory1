import test from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"
import { adjustInventory, allocateDemand, createDemand, reserveLine, returnAllocation } from "../../src/lib/inventory-service"

const enabled = Boolean(process.env.DATABASE_URL)
const prisma = new PrismaClient()

test("reserve -> allocate -> return has one stock-out fact and auditable balances", { skip: !enabled }, async () => {
  const suffix = Date.now().toString()
  const user = await prisma.user.create({ data: { email: "workflow-" + suffix + "@test.local", name: "Workflow Test", password: "not-used" } })
  const item = await prisma.item.create({ data: {
    code: "TEST-" + suffix, title: "Workflow item", discipline: "MECHANICAL",
    createdById: user.id,
    balance: { create: { onHand: 10 } },
  } })
  const demand = await createDemand({ requestedById: user.id, lines: [{ itemId: item.id, quantity: 6 }] })
  const lineId = demand!.lines[0].id
  await reserveLine({ lineId, quantity: 6, actorId: user.id, sourceId: "reserve-" + suffix })
  const afterReserve = await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })
  assert.equal(afterReserve.onHand.toString(), "10")
  assert.equal(afterReserve.reserved.toString(), "6")
  const allocation = await allocateDemand({ demandId: demand!.id, actorId: user.id, idempotencyKey: "allocate-" + suffix, lines: [{ demandLineId: lineId, quantity: 4 }] })
  const afterAllocation = await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })
  assert.equal(afterAllocation.onHand.toString(), "6")
  assert.equal(afterAllocation.reserved.toString(), "2")
  assert.equal(await prisma.inventoryLedgerEntry.count({ where: { itemId: item.id, type: "ALLOCATION" } }), 1)
  await returnAllocation({ actorId: user.id, idempotencyKey: "return-" + suffix, lines: [{ allocationLineId: allocation!.lines[0].id, quantity: 1 }] })
  const afterReturn = await prisma.itemBalance.findUniqueOrThrow({ where: { itemId: item.id } })
  assert.equal(afterReturn.onHand.toString(), "7")
  assert.equal(afterReturn.reserved.toString(), "2")
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

test.after(async () => prisma.$disconnect())
