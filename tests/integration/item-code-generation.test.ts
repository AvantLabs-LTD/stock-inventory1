import test from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"
import { createCatalogueItem, generatedItemCodeBase } from "../../src/lib/item-service"

const enabled = Boolean(process.env.DATABASE_URL)
const prisma = new PrismaClient()

test("complete component codes are derived from the normalized title", () => {
  assert.equal(generatedItemCodeBase("J30J-37TK 300mm"), "CMP-J30J-37TK-300MM")
  assert.equal(generatedItemCodeBase("  M3 × 10 socket cap screw  "), "CMP-M3-10-SOCKET-CAP-SCREW")
})

test("complete component creation generates unique codes without caller input", { skip: !enabled }, async () => {
  const suffix = Date.now().toString(36)
  const user = await prisma.user.create({ data: {
    email: `item-code-${suffix}@test.local`,
    name: "Item Code Test",
    password: "not-used",
    role: "INVENTORY_MANAGER",
  } })
  const category = await prisma.itemCategory.create({ data: {
    name: `Generated code ${suffix}`,
    normalizedName: `generated code ${suffix}`,
    discipline: "ELECTRONICS",
  } })
  const title = `Generated connector ${suffix}`
  const input = { title, discipline: "ELECTRONICS" as const, categoryId: category.id, unit: "pcs" }

  const first = await createCatalogueItem(prisma, input, user.id)
  const second = await createCatalogueItem(prisma, input, user.id)

  assert.equal(first.code, generatedItemCodeBase(title))
  assert.match(second.code, new RegExp(`^${generatedItemCodeBase(title)}-[A-F0-9]{6}$`))
  assert.notEqual(first.code, second.code)
  assert.equal(first.createdById, user.id)
  assert.equal(first.balance?.onHand.toString(), "0")
})

test.after(async () => prisma.$disconnect())
