import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import { issueServiceToken } from "../../src/lib/service-tokens"

test("service tokens are random and only their hash is stored", () => {
  const first = issueServiceToken()
  const second = issueServiceToken()
  assert.match(first.plaintext, /^flux_[0-9a-f-]{36}_[A-Za-z0-9_-]{43}$/)
  assert.notEqual(first.plaintext, second.plaintext)
  assert.equal(first.tokenHash, createHash("sha256").update(first.plaintext).digest("hex"))
  assert.ok(!first.tokenHash.includes(first.plaintext))
})
