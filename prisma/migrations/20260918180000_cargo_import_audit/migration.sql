-- Preserve legacy journey evidence and explicit source-to-target review state.
BEGIN;

CREATE TABLE "cargo_legacy_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shipmentId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "rawStatus" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "sourceUserId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cargo_legacy_events_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "cargo_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_legacy_events_packageId_shipmentId_fkey" FOREIGN KEY ("packageId", "shipmentId") REFERENCES "cargo_packages"("id", "shipmentId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "cargo_legacy_events_shipmentId_occurredAt_idx" ON "cargo_legacy_events"("shipmentId", "occurredAt");

CREATE TABLE "cargo_import_records" (
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceHash" VARCHAR(64) NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "sourceFacts" JSONB,
  "reviewReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cargo_import_records_pkey" PRIMARY KEY ("sourceType", "sourceId"),
  CONSTRAINT "cargo_import_records_hash_check" CHECK ("sourceHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "cargo_import_records_target_check" CHECK (("targetType" IS NULL) = ("targetId" IS NULL))
);
CREATE INDEX "cargo_import_records_reviewReason_idx" ON "cargo_import_records"("reviewReason");

COMMIT;
