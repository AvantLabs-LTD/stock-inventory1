BEGIN;

CREATE TABLE "service_tokens" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "service_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_tokens_scopes_check" CHECK (array_length("scopes", 1) > 0),
  CONSTRAINT "service_tokens_hash_check" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "service_tokens_tokenHash_key" ON "service_tokens"("tokenHash");
CREATE INDEX "service_tokens_userId_revokedAt_idx" ON "service_tokens"("userId", "revokedAt");

CREATE TABLE "cargo_request_keys" (
  "actorId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cargo_request_keys_pkey" PRIMARY KEY ("actorId", "key"),
  CONSTRAINT "cargo_request_keys_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_request_keys_hash_check" CHECK ("requestHash" ~ '^[a-f0-9]{64}$')
);

COMMIT;
