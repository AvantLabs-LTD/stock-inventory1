import { randomUUID } from "node:crypto"
import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server"
import { db } from "../../src/lib/db"
import { issueServiceToken } from "../../src/lib/service-tokens"
import { POST as optimize } from "../../src/app/api/v1/item-optimization/route"
import { saveAlternativeGroup, deleteAlternativeGroup, previewStandardization, commitStandardization, previewMerge, commitMerge } from "../../src/lib/item-optimization-service"

async function fixture() {
  const key = randomUUID()
  const actor = await db.user.create({ data: { email: `${key}@optimization.test`, name: "Optimization test", password: randomUUID(), role: "INVENTORY_MANAGER" } })
  const create = (suffix: string) => db.item.create({ data: { code: `${key}-${suffix}`, title: `Component ${suffix}`, discipline: "MECHANICAL", unit: "pcs", createdById: actor.id } })
  return { key, actor, source: await create("source"), target: await create("target") }
}

test("standardization clones all BOM facts, remaps parents, preserves accepted source and retries safely", { skip: !process.env.DATABASE_URL }, async () => {
  const { key, actor, source, target } = await fixture()
  const group = await saveAlternativeGroup({ name: key, itemIds: [source.id, target.id] }, actor)
  const bom = await db.billOfMaterial.create({ data: { name: key, itemId: target.id, createdById: actor.id } })
  const base = await db.bomVersion.create({ data: { bomId: bom.id, revision: "accepted", status: "ACTIVE", effectiveFrom: new Date("2026-01-01"), createdById: actor.id } })
  const parent = await db.bomLine.create({ data: { bomVersionId: base.id, sourceLineKey: "parent", itemId: source.id, quantity: "2.125", unit: "pcs", sortOrder: 9, notes: "Preserve evidence", scrapAllowance: "0.1", applicability: { create: { tag: "build", quantity: "4" } } } })
  await db.bomLine.create({ data: { bomVersionId: base.id, sourceLineKey: "child", parentLineId: parent.id, itemId: source.id, quantity: "3", sortOrder: 0 } })
  const input = { groupId: group.id, targetItemId: target.id, lineIds: [parent.id], reason: "Standardize" }
  const preview = await previewStandardization(input)
  await assert.rejects(commitStandardization({ ...input, reason: "Changed decision" }, preview.token, actor, `${key}-stale`), /fresh preview/)
  assert.equal(await db.bomVersion.count({ where: { bomId: bom.id } }), 1)
  const result = await commitStandardization(input, preview.token, actor, key)
  assert.deepEqual(await commitStandardization(input, preview.token, actor, key), result)
  const draft = await db.bomVersion.findUniqueOrThrow({ where: { id: result.revisions[0].id }, include: { lines: { include: { applicability: true } } } })
  assert.equal(draft.status, "DRAFT")
  assert.deepEqual(draft.effectiveFrom, base.effectiveFrom)
  const newParent = draft.lines.find(row => row.sourceLineKey === "parent")!
  assert.equal(newParent.itemId, target.id)
  assert.equal(newParent.quantity.toString(), "2.125")
  assert.equal(newParent.scrapAllowance?.toString(), "0.1")
  assert.equal(newParent.notes, parent.notes)
  assert.equal(newParent.sortOrder, 9)
  assert.equal(newParent.applicability[0].quantity.toString(), "4")
  assert.equal(draft.lines.find(row => row.sourceLineKey === "child")!.parentLineId, newParent.id)
  assert.equal(draft.lines.find(row => row.sourceLineKey === "child")!.itemId, source.id)
  assert.equal((await db.bomLine.findUniqueOrThrow({ where: { id: parent.id } })).itemId, source.id)
  assert.equal((await db.bomVersion.findUniqueOrThrow({ where: { id: base.id } })).status, "ACTIVE")
  assert.equal(await db.auditLog.count({ where: { entityId: draft.id, action: "OPTIMIZATION_BOM_DRAFT_CREATE" } }), 1)
  await deleteAlternativeGroup(group.id, actor)
  assert.equal(await db.itemAlternativeMembership.count({ where: { groupId: group.id } }), 0)
})

test("merge transfers Decimal stock using paired ledger entries, copies metadata and rejects stale previews atomically", { skip: !process.env.DATABASE_URL }, async () => {
  const { key, actor, source, target } = await fixture()
  await db.itemBalance.create({ data: { itemId: source.id, onHand: "2.125" } })
  await db.itemSupplierLink.create({ data: { itemId: source.id, url: "https://example.com/component", description: "Canonical reference", optionSelection: "Blue" } })
  const input = { sourceItemId: source.id, targetItemId: target.id, moveBalance: true, moveOpenDemand: false, moveOpenPurchases: false, moveBomLines: false, copySupplierLinks: true, reason: "Duplicate correction" }
  const stale = await previewMerge(input)
  await db.item.update({ where: { id: target.id }, data: { title: "Changed after preview" } })
  await assert.rejects(commitMerge(input, stale.token, actor, `${key}-stale`), /fresh preview/)
  assert.equal(await db.itemMerge.count({ where: { sourceItemId: source.id } }), 0)
  assert.equal(await db.apiRequestKey.count({ where: { actorId: actor.id, key: `${key}-stale` } }), 0)
  const preview = await previewMerge(input)
  const result = await commitMerge(input, preview.token, actor, key)
  assert.deepEqual(await commitMerge(input, preview.token, actor, key), result)
  assert.equal((await db.itemBalance.findUniqueOrThrow({ where: { itemId: source.id } })).onHand.toString(), "0")
  assert.equal((await db.itemBalance.findUniqueOrThrow({ where: { itemId: target.id } })).onHand.toString(), "2.125")
  const ledger = await db.inventoryLedgerEntry.findMany({ where: { itemId: { in: [source.id, target.id] } } })
  assert.equal(ledger.length, 2)
  assert.equal(ledger[0].quantity.plus(ledger[1].quantity).toString(), "0")
  assert.equal((await db.item.findUniqueOrThrow({ where: { id: source.id } })).status, "ARCHIVED")
  assert.equal(await db.itemSupplierLink.count({ where: { itemId: { in: [source.id, target.id] } } }), 2)
  assert.equal(await db.auditLog.count({ where: { entityId: source.id, action: "MERGE_ITEM" } }), 1)
})

test("merge cannot transfer stock away from retained allocations and leaves no partial writes", { skip: !process.env.DATABASE_URL }, async () => {
  const { key, actor, source, target } = await fixture()
  await db.itemBalance.create({ data: { itemId: source.id, onHand: "5", reserved: "3" } })
  const input = { sourceItemId: source.id, targetItemId: target.id, moveBalance: true, moveOpenDemand: false, moveOpenPurchases: false, moveBomLines: false, copySupplierLinks: false, reason: "Invalid transfer" }
  const preview = await previewMerge(input)
  assert.ok(preview.blockers.length)
  await assert.rejects(commitMerge(input, preview.token, actor, key), /still allocated/)
  assert.equal(await db.itemMerge.count({ where: { sourceItemId: source.id } }), 0)
  assert.equal(await db.inventoryLedgerEntry.count({ where: { itemId: source.id } }), 0)
  assert.equal(await db.apiRequestKey.count({ where: { actorId: actor.id, key } }), 0)
  assert.equal((await db.item.findUniqueOrThrow({ where: { id: source.id } })).status, "ACTIVE")
  assert.equal((await db.itemBalance.findUniqueOrThrow({ where: { itemId: source.id } })).onHand.toString(), "5")
})

test("competing merges of the same source commit at most once", { skip: !process.env.DATABASE_URL }, async () => {
  const { key, actor, source, target } = await fixture()
  const input = { sourceItemId: source.id, targetItemId: target.id, moveBalance: false, moveOpenDemand: false, moveOpenPurchases: false, moveBomLines: false, copySupplierLinks: false, reason: "Concurrent correction" }
  const preview = await previewMerge(input)
  const results = await Promise.allSettled([commitMerge(input, preview.token, actor, `${key}-a`), commitMerge(input, preview.token, actor, `${key}-b`)])
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1)
  assert.equal(await db.itemMerge.count({ where: { sourceItemId: source.id } }), 1)
  assert.equal(await db.auditLog.count({ where: { entityId: source.id, action: "MERGE_ITEM" } }), 1)
})

test("API scopes cannot escalate a catalogue merge into stock or BOM writes", { skip: !process.env.DATABASE_URL }, async () => {
  const { key, actor, source, target } = await fixture()
  await db.userAccessGroup.create({ data: { userId: actor.id, groupId: "flux_admin" } })
  const token = issueServiceToken()
  await db.serviceToken.create({ data: { id: token.id, userId: actor.id, name: "Catalogue-only test", tokenHash: token.tokenHash, scopes: ["vault.catalogue.manage"], expiresAt: new Date(Date.now() + 60_000) } })
  const input = { sourceItemId: source.id, targetItemId: target.id, moveBalance: false, moveOpenDemand: false, moveOpenPurchases: false, moveBomLines: false, copySupplierLinks: false, reason: key }
  const request = (action: string, value: unknown) => optimize(new NextRequest("http://localhost/api/v1/item-optimization", { method: "POST", headers: { authorization: `Bearer ${token.plaintext}`, "content-type": "application/json" }, body: JSON.stringify({ action, input: value }) }))
  assert.equal((await request("merge.preview", input)).status, 200)
  for (const flag of ["moveBalance", "moveOpenDemand", "moveOpenPurchases", "moveBomLines"]) assert.equal((await request("merge.preview", { ...input, [flag]: true })).status, 403)
  assert.equal((await request("standardize.preview", {})).status, 403)
  assert.equal(await db.itemMerge.count({ where: { sourceItemId: source.id } }), 0)
})

test("linked backlog demand moves together with approval allocation, while ordered purchases remain historical", { skip: !process.env.DATABASE_URL }, async () => {
  const { key, actor, source, target } = await fixture()
  await db.itemBalance.create({ data: { itemId: source.id, onHand: "5", reserved: "2" } })
  const demand = await db.demand.create({ data: { demandNo: key, requestedById: actor.id, state: "ACTIVE", lines: { create: { itemId: source.id, title: source.title, unit: "pcs", requiredQuantity: "5", approvedQuantity: "5", approvedFromStockQuantity: "2", approvedForProcurementQuantity: "3", approvedById: actor.id, approvedAt: new Date() } } }, include: { lines: true } })
  const purchase = await db.purchaseRequest.create({ data: { requestNo: key, createdById: actor.id, lines: { create: { itemId: source.id, type: "LOCAL_STANDARD", quantity: "3", demandLinks: { create: { demandLineId: demand.lines[0].id, quantity: "3" } } } } }, include: { lines: true } })
  const historical = await db.purchaseRequest.create({ data: { requestNo: `${key}-ordered`, status: "ORDERED", createdById: actor.id, lines: { create: { itemId: source.id, type: "LOCAL_STANDARD", quantity: "1" } } }, include: { lines: true } })
  const input = { sourceItemId: source.id, targetItemId: target.id, moveBalance: true, moveOpenDemand: true, moveOpenPurchases: false, moveBomLines: false, copySupplierLinks: false, reason: "Linked correction" }
  const blocked = await previewMerge(input)
  assert.ok(blocked.blockers.some(message => message.includes("together")))
  await assert.rejects(commitMerge(input, blocked.token, actor, `${key}-blocked`))
  const complete = { ...input, moveOpenPurchases: true }
  const preview = await previewMerge(complete)
  assert.deepEqual(preview.blockers, [])
  await commitMerge(complete, preview.token, actor, key)
  const moved = await db.demandLine.findUniqueOrThrow({ where: { id: demand.lines[0].id } })
  assert.equal(moved.itemId, target.id)
  assert.equal(moved.approvedFromStockQuantity?.toString(), "2")
  assert.equal((await db.itemBalance.findUniqueOrThrow({ where: { itemId: target.id } })).reserved.toString(), "2")
  assert.equal((await db.itemBalance.findUniqueOrThrow({ where: { itemId: source.id } })).reserved.toString(), "0")
  assert.equal((await db.purchaseRequestLine.findUniqueOrThrow({ where: { id: purchase.lines[0].id } })).itemId, target.id)
  assert.equal((await db.purchaseRequestLine.findUniqueOrThrow({ where: { id: historical.lines[0].id } })).itemId, source.id)
  assert.equal((await db.demandPurchaseLink.findFirstOrThrow({ where: { demandLineId: moved.id } })).quantity.toString(), "3")
})
