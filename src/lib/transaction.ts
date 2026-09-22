import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"

const DEFAULT_ATTEMPTS = 3

export function isSerializableConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
}

/**
 * Runs a transaction at PostgreSQL serializable isolation and retries only
 * transaction-serialization failures. Domain validation errors are never
 * retried. Consequential callers must still use an idempotency key.
 */
export async function runSerializable<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { attempts?: number; timeout?: number } = {},
) {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        ...(options.timeout ? { timeout: options.timeout } : {}),
      })
    } catch (error) {
      if (isSerializableConflict(error) && attempt + 1 < attempts) continue
      throw error
    }
  }
  throw new Error("Unreachable transaction retry state")
}
