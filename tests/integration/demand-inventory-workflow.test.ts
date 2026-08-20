import test from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"
import { allocateDemand, createDemand, reserveLine, returnAllocation } from "../../src/lib/inventory-service"

const enabled = Boolean(process.env.DATABASE_URL)
const prisma = new PrismaClient()

test("reserve -> allocate -> return has one stock-out fact and auditable balances", { skip: !enabled }, async () => {
  const suffix = Date.now().toString()
  const user = await prisma.user.create({ data: { email: "workflow-" + suffix + "@test.local", name: "Workflow Test", password: "not-used" } })
  const classification = await prisma.itemClassification.findFirstOrThrow()
  const item = await prisma.item.create({ data: {
    code: "TEST-" + suffix, title: "Workflow item", discipline: "MECHANICAL",
    defaultClassificationId: classification.id, createdById: user.id,
    balance: { create: { onHand: 10 } },
  } })
  const demand = await createDemand({ requestedById: user.id, lines: [{ itemId: item.id, classificationId: classification.id, quantity: 6 }] })
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

test.after(async () => prisma.$disconnect())
