import test from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"
import { createCatalogueItem, generatedItemCodeBase, updateCatalogueItem } from "../../src/lib/item-service"

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

test("catalogue edits store the changed fields and actor in an immutable audit entry", { skip: !enabled }, async () => {
  const suffix = `${Date.now().toString(36)}-audit`
  const user = await prisma.user.create({ data: {
    email: `item-edit-${suffix}@test.local`,
    name: "Catalogue Editor",
    password: "not-used",
    role: "INVENTORY_MANAGER",
  } })
  const category = await prisma.itemCategory.create({ data: {
    name: `Editable items ${suffix}`,
    normalizedName: `editable items ${suffix}`,
    discipline: "MECHANICAL",
  } })
  const item = await createCatalogueItem(prisma, {
    title: `Editable bracket ${suffix}`,
    discipline: "MECHANICAL",
    categoryId: category.id,
    description: "Original description",
    unit: "pcs",
  }, user.id)

  const updated = await prisma.$transaction(tx => updateCatalogueItem(tx, item.id, {
    description: "Revised manufacturing description",
    remarks: "Drawing checked",
  }, { id: user.id, name: user.name }))

  assert.equal(updated.description, "Revised manufacturing description")
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "Item", entityId: item.id }, orderBy: { date: "desc" } })
  assert.equal(audit.action, "UPDATE_CATALOGUE_ITEM")
  assert.equal(audit.userName, "Catalogue Editor")
  const details = JSON.parse(audit.details || "{}")
  assert.deepEqual(details.changes.description, { before: "Original description", after: "Revised manufacturing description" })
  assert.deepEqual(details.changes.remarks, { before: null, after: "Drawing checked" })
})

test.after(async () => prisma.$disconnect())
