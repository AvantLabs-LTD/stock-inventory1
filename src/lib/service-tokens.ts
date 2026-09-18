import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { db } from "@/lib/db"

export function issueServiceToken() {
  const id = randomUUID()
  const plaintext = `flux_${id}_${randomBytes(32).toString("base64url")}`
  return { id, plaintext, tokenHash: createHash("sha256").update(plaintext).digest("hex") }
}

export async function verifyServiceToken(plaintext: string) {
  const match = /^flux_([0-9a-f-]{36})_([A-Za-z0-9_-]{43})$/.exec(plaintext)
  if (!match) return null
  const record = await db.serviceToken.findUnique({ where: { id: match[1] }, include: { user: { select: {
    id: true, email: true, name: true, status: true, role: true,
    accessGroups: { include: { group: { include: { permissions: { select: { permissionKey: true } } } } } },
  } } } })
  if (!record || record.revokedAt || record.expiresAt <= new Date() || record.user.status !== "ACTIVE") return null
  const candidate = createHash("sha256").update(plaintext).digest()
  if (!timingSafeEqual(candidate, Buffer.from(record.tokenHash, "hex"))) return null
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60 * 60 * 1000) {
    await db.serviceToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
  }
  return record
}
