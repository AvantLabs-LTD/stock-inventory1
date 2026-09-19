ALTER TABLE "cargo_shipments"
  ADD COLUMN "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "cargo_packages"
  ADD COLUMN "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE UNIQUE INDEX "cargo_shipments_shipment_no_ci_key"
  ON "cargo_shipments" (LOWER("shipmentNo"));

CREATE UNIQUE INDEX "cargo_packages_package_no_ci_key"
  ON "cargo_packages" (LOWER("packageNo"));

CREATE INDEX "cargo_shipments_status_created_at_idx"
  ON "cargo_shipments" ("status", "createdAt" DESC);

CREATE INDEX "cargo_packages_status_created_at_idx"
  ON "cargo_packages" ("status", "createdAt" DESC);
