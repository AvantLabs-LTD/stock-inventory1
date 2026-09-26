import assert from "node:assert/strict"
import test from "node:test"
import { nameSimilarity, itemSimilarity } from "../../src/lib/item-similarity"

test("similarity normalizes names and requires real specification evidence", () => {
  assert.equal(nameSimilarity("  LOCK M3 ", "lock m3"), 1)
  assert.equal(nameSimilarity("", ""), 0)
  assert.equal(itemSimilarity({ title: "Lock", specification: null }, { title: "Lock", specification: null }, false), 1)
  assert.equal(itemSimilarity({ title: "Lock", specification: null }, { title: "Lock", specification: null }, true), 0)
  assert.ok(itemSimilarity({ title: "Lock", specification: "M3 steel" }, { title: "Lock", specification: "M4 plastic" }, true) < 1)
})
