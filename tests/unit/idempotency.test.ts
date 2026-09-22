import assert from "node:assert/strict"
import { test } from "node:test"
import { completeIdempotentRequest, IdempotencyError, normalizeIdempotencyKey, replayOrStartIdempotentRequest, requestHash } from "../../src/lib/idempotency"

test("idempotency keys are bounded and request hashes ignore object property order", () => {
  assert.equal(normalizeIdempotencyKey("  production-release:1234  "), "production-release:1234")
  assert.equal(
    requestHash("manufacturing.order.release", { orderId: "order-1", options: { reserveSerials: true, quantity: "10" } }),
    requestHash("manufacturing.order.release", { options: { quantity: "10", reserveSerials: true }, orderId: "order-1" }),
  )
})

test("idempotency keys reject unsafe or ambiguous identifiers", () => {
  assert.throws(() => normalizeIdempotencyKey("short"), (error: unknown) => error instanceof IdempotencyError && error.code === "INVALID_IDEMPOTENCY_KEY")
  assert.throws(() => normalizeIdempotencyKey("contains spaces 123"), (error: unknown) => error instanceof IdempotencyError && error.code === "INVALID_IDEMPOTENCY_KEY")
})

test("the shared request-key protocol replays only an identical completed request", async () => {
  const records = new Map<string, { actorId: string; key: string; action: string; requestHash: string; response: unknown }>()
  const tx = {
    apiRequestKey: {
      findUnique: async ({ where }: { where: { actorId_key: { actorId: string; key: string } } }) => records.get(`${where.actorId_key.actorId}:${where.actorId_key.key}`) || null,
      create: async ({ data }: { data: { actorId: string; key: string; action: string; requestHash: string } }) => {
        records.set(`${data.actorId}:${data.key}`, { ...data, response: null })
      },
      update: async ({ where, data }: { where: { actorId_key: { actorId: string; key: string } }; data: { response: unknown } }) => {
        const record = records.get(`${where.actorId_key.actorId}:${where.actorId_key.key}`)
        assert.ok(record)
        record.response = data.response
      },
    },
  }
  const request = { actorId: "user-1", key: "production-release:1234", action: "manufacturing.order.release", payload: { orderId: "order-1" } }

  assert.equal(await replayOrStartIdempotentRequest(tx as never, request), null)
  await completeIdempotentRequest(tx as never, { actorId: request.actorId, key: request.key, response: { orderId: "order-1", released: true } })
  assert.deepEqual(await replayOrStartIdempotentRequest(tx as never, request), { orderId: "order-1", released: true })
  await assert.rejects(
    () => replayOrStartIdempotentRequest(tx as never, { ...request, payload: { orderId: "order-2" } }),
    (error: unknown) => error instanceof IdempotencyError && error.code === "IDEMPOTENCY_KEY_CONFLICT",
  )
})
