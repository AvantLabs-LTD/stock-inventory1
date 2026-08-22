import test from "node:test"
import assert from "node:assert/strict"
import { matchesItemSearch, tokenizeItemSearch } from "../../src/lib/item-search"

test("catalogue search terms may match different component fields", () => {
  const terms = tokenizeItemSearch("20 mm braided sleeve")
  assert.deepEqual(terms, ["20", "mm", "braided", "sleeve"])
  assert.equal(matchesItemSearch(terms, ["Braided sleeve", "20 mm", "MECH-100"]), true)
  assert.equal(matchesItemSearch(terms, ["Braided sleeve", "10 mm", "MECH-100"]), false)
})

test("catalogue search ignores repeated whitespace and duplicate terms", () => {
  assert.deepEqual(tokenizeItemSearch("  Sleeve   sleeve  20 mm  "), ["Sleeve", "sleeve", "20", "mm"])
})
