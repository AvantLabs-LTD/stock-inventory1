import assert from "node:assert/strict"
import test from "node:test"
import { ManufacturingDefinitionError, validateBomHierarchy } from "../../src/lib/manufacturing-definitions-service"

test("manufacturing BOM hierarchy accepts roots and nested component lines", () => {
  assert.doesNotThrow(() => validateBomHierarchy([
    { sourceLineKey: "MODULE", parentSourceLineKey: null },
    { sourceLineKey: "PCB", parentSourceLineKey: "MODULE" },
    { sourceLineKey: "MCU", parentSourceLineKey: "PCB" },
  ]))
})

test("manufacturing BOM hierarchy rejects duplicate, missing, and cyclic parents", () => {
  for (const lines of [
    [{ sourceLineKey: "A", parentSourceLineKey: null }, { sourceLineKey: "A", parentSourceLineKey: null }],
    [{ sourceLineKey: "A", parentSourceLineKey: "MISSING" }],
    [{ sourceLineKey: "A", parentSourceLineKey: "B" }, { sourceLineKey: "B", parentSourceLineKey: "A" }],
  ]) {
    assert.throws(() => validateBomHierarchy(lines), ManufacturingDefinitionError)
  }
})
