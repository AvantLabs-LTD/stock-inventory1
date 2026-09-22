import { createHash } from "node:crypto"
import { Prisma } from "@prisma/client"

export class IdempotencyError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,120}$/

export function normalizeIdempotencyKey(value?: string | null) {
  const key = value?.trim() || null
  if (key && !KEY_PATTERN.test(key)) {
    throw new IdempotencyError("INVALID_IDEMPOTENCY_KEY", "Use an 8–120 character idempotency key")
  }
  return key
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]))
  }
  return value
}

export function requestHash(action: string, payload: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical({ action, payload }))).digest("hex")
}

export async function replayOrStartIdempotentRequest(
  tx: Prisma.TransactionClient,
  input: { actorId: string; key: string | null; action: string; payload: unknown },
) {
  if (!input.key) return null
  const hash = requestHash(input.action, input.payload)
  const existing = await tx.apiRequestKey.findUnique({
    where: { actorId_key: { actorId: input.actorId, key: input.key } },
  })
  if (existing) {
    if (existing.action !== input.action || existing.requestHash !== hash) {
      throw new IdempotencyError("IDEMPOTENCY_KEY_CONFLICT", "This idempotency key was already used with different input", 409)
    }
    if (existing.response === null) {
      throw new IdempotencyError("IDEMPOTENCY_IN_PROGRESS", "The matching request is still being committed; retry shortly", 409)
    }
    return existing.response
  }
  await tx.apiRequestKey.create({ data: { actorId: input.actorId, key: input.key, action: input.action, requestHash: hash } })
  return null
}

export async function completeIdempotentRequest(
  tx: Prisma.TransactionClient,
  input: { actorId: string; key: string | null; response: unknown },
) {
  if (!input.key) return
  await tx.apiRequestKey.update({
    where: { actorId_key: { actorId: input.actorId, key: input.key } },
    data: { response: JSON.parse(JSON.stringify(input.response)) },
  })
}
