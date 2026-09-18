-- Additive Cargo foundation. No PakLogix records are imported in this migration.
BEGIN;

CREATE TYPE "CargoRoute" AS ENUM ('DIRECT', 'FORWARDED');
CREATE TYPE "CargoStage" AS ENUM (
  'AT_VENDOR', 'TO_SOURCE_WAREHOUSE', 'AT_SOURCE_WAREHOUSE',
  'IN_INTERNATIONAL_TRANSIT', 'ARRIVED_IN_COUNTRY', 'CUSTOMS_PENDING',
  'CUSTOMS_CLEARED', 'OUT_FOR_DELIVERY', 'RECEIVED'
);
CREATE TYPE "CargoLegKind" AS ENUM ('SOURCE_INLAND', 'INTERNATIONAL', 'CUSTOMS', 'DESTINATION_INLAND');
CREATE TYPE "CargoChargeCategory" AS ENUM ('SOURCE_INLAND', 'INTERNATIONAL_FREIGHT', 'CUSTOMS_DUTY', 'CUSTOMS_CLEARANCE', 'DESTINATION_INLAND', 'HANDLING', 'OTHER');
CREATE TYPE "CargoFileKind" AS ENUM ('CONTENT_PHOTO', 'CARTON_PHOTO', 'INVOICE', 'RECEIPT', 'SHIPPING_DOCUMENT', 'OTHER');

CREATE TABLE "cargo_forwarders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL UNIQUE,
  "contactPerson" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "notes" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "cargo_source_warehouses" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "forwarderId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "address" TEXT,
  "notes" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cargo_source_warehouses_forwarderId_fkey" FOREIGN KEY ("forwarderId") REFERENCES "cargo_forwarders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_source_warehouses_forwarderId_normalizedName_key" UNIQUE ("forwarderId", "normalizedName"),
  CONSTRAINT "cargo_source_warehouses_id_forwarderId_key" UNIQUE ("id", "forwarderId")
);

CREATE TABLE "cargo_couriers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL UNIQUE,
  "code" TEXT UNIQUE,
  "phone" TEXT,
  "website" TEXT,
  "notes" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "cargo_shipments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shipmentNo" TEXT NOT NULL UNIQUE,
  "route" "CargoRoute" NOT NULL,
  "forwarderId" TEXT,
  "sourceWarehouseId" TEXT,
  "createdById" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cargo_shipments_forwarderId_fkey" FOREIGN KEY ("forwarderId") REFERENCES "cargo_forwarders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_shipments_sourceWarehouseId_forwarderId_fkey" FOREIGN KEY ("sourceWarehouseId", "forwarderId") REFERENCES "cargo_source_warehouses"("id", "forwarderId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_shipments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_shipments_direct_route_check" CHECK ("route" <> 'DIRECT' OR ("forwarderId" IS NULL AND "sourceWarehouseId" IS NULL)),
  CONSTRAINT "cargo_shipments_warehouse_forwarder_check" CHECK ("sourceWarehouseId" IS NULL OR "forwarderId" IS NOT NULL)
);
CREATE INDEX "cargo_shipments_forwarderId_idx" ON "cargo_shipments"("forwarderId");
CREATE INDEX "cargo_shipments_sourceWarehouseId_idx" ON "cargo_shipments"("sourceWarehouseId");

CREATE TABLE "cargo_packages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "packageNo" TEXT NOT NULL UNIQUE,
  "shipmentId" TEXT NOT NULL,
  "vendorId" TEXT,
  "weight" DECIMAL(12,3),
  "verifiedWeight" DECIMAL(12,3),
  "length" DECIMAL(12,2),
  "width" DECIMAL(12,2),
  "height" DECIMAL(12,2),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cargo_packages_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "cargo_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_packages_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_packages_id_shipmentId_key" UNIQUE ("id", "shipmentId"),
  CONSTRAINT "cargo_packages_measurements_check" CHECK (
    ("weight" IS NULL OR "weight" > 0) AND
    ("verifiedWeight" IS NULL OR "verifiedWeight" > 0) AND
    ("length" IS NULL OR "length" > 0) AND
    ("width" IS NULL OR "width" > 0) AND
    ("height" IS NULL OR "height" > 0)
  )
);
CREATE INDEX "cargo_packages_shipmentId_idx" ON "cargo_packages"("shipmentId");
CREATE INDEX "cargo_packages_vendorId_idx" ON "cargo_packages"("vendorId");

CREATE TABLE "cargo_package_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "packageId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cargo_package_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "cargo_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_package_items_quantity_check" CHECK ("quantity" > 0)
);
CREATE INDEX "cargo_package_items_packageId_sortOrder_idx" ON "cargo_package_items"("packageId", "sortOrder");

CREATE TABLE "cargo_milestones" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shipmentId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "stage" "CargoStage" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "location" TEXT,
  "remarks" TEXT,
  "postedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cargo_milestones_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "cargo_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_milestones_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cargo_milestones_shipmentId_sequence_key" UNIQUE ("shipmentId", "sequence"),
  CONSTRAINT "cargo_milestones_sequence_check" CHECK ("sequence" >= 0)
);
CREATE INDEX "cargo_milestones_stage_occurredAt_idx" ON "cargo_milestones"("stage", "occurredAt");

CREATE TABLE "cargo_tracking_legs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shipmentId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "kind" "CargoLegKind" NOT NULL,
  "courierId" TEXT,
  "trackingNumber" TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "arrivedAt" TIMESTAMP(3),
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cargo_tracking_legs_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "cargo_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_tracking_legs_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "cargo_couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_tracking_legs_shipmentId_sequence_key" UNIQUE ("shipmentId", "sequence"),
  CONSTRAINT "cargo_tracking_legs_id_shipmentId_key" UNIQUE ("id", "shipmentId"),
  CONSTRAINT "cargo_tracking_legs_sequence_check" CHECK ("sequence" >= 0),
  CONSTRAINT "cargo_tracking_legs_dates_check" CHECK ("arrivedAt" IS NULL OR "dispatchedAt" IS NULL OR "arrivedAt" >= "dispatchedAt")
);
CREATE INDEX "cargo_tracking_legs_courierId_idx" ON "cargo_tracking_legs"("courierId");
CREATE INDEX "cargo_tracking_legs_trackingNumber_idx" ON "cargo_tracking_legs"("trackingNumber");

CREATE TABLE "cargo_invoices" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shipmentId" TEXT NOT NULL,
  "packageId" TEXT,
  "trackingLegId" TEXT,
  "invoiceNo" TEXT,
  "sourceName" TEXT,
  "invoiceDate" TIMESTAMP(3),
  "totalAmount" DECIMAL(18,4),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'PKR',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cargo_invoices_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "cargo_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_invoices_packageId_shipmentId_fkey" FOREIGN KEY ("packageId", "shipmentId") REFERENCES "cargo_packages"("id", "shipmentId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_invoices_trackingLegId_shipmentId_fkey" FOREIGN KEY ("trackingLegId", "shipmentId") REFERENCES "cargo_tracking_legs"("id", "shipmentId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_invoices_id_shipmentId_key" UNIQUE ("id", "shipmentId"),
  CONSTRAINT "cargo_invoices_amount_check" CHECK ("totalAmount" IS NULL OR "totalAmount" >= 0),
  CONSTRAINT "cargo_invoices_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE INDEX "cargo_invoices_shipmentId_idx" ON "cargo_invoices"("shipmentId");
CREATE INDEX "cargo_invoices_packageId_idx" ON "cargo_invoices"("packageId");
CREATE INDEX "cargo_invoices_trackingLegId_idx" ON "cargo_invoices"("trackingLegId");

CREATE TABLE "cargo_charges" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shipmentId" TEXT NOT NULL,
  "packageId" TEXT,
  "trackingLegId" TEXT,
  "invoiceId" TEXT,
  "category" "CargoChargeCategory" NOT NULL,
  "amount" DECIMAL(18,4) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "pkrEquivalent" DECIMAL(18,4),
  "pkrNote" TEXT,
  "remarks" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cargo_charges_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "cargo_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_charges_packageId_shipmentId_fkey" FOREIGN KEY ("packageId", "shipmentId") REFERENCES "cargo_packages"("id", "shipmentId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_charges_trackingLegId_shipmentId_fkey" FOREIGN KEY ("trackingLegId", "shipmentId") REFERENCES "cargo_tracking_legs"("id", "shipmentId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_charges_invoiceId_shipmentId_fkey" FOREIGN KEY ("invoiceId", "shipmentId") REFERENCES "cargo_invoices"("id", "shipmentId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_charges_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_charges_amount_check" CHECK ("amount" > 0 AND ("pkrEquivalent" IS NULL OR "pkrEquivalent" >= 0)),
  CONSTRAINT "cargo_charges_pkr_note_check" CHECK ("pkrEquivalent" IS NULL OR NULLIF(BTRIM("pkrNote"), '') IS NOT NULL),
  CONSTRAINT "cargo_charges_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE INDEX "cargo_charges_shipmentId_idx" ON "cargo_charges"("shipmentId");
CREATE INDEX "cargo_charges_packageId_idx" ON "cargo_charges"("packageId");
CREATE INDEX "cargo_charges_trackingLegId_idx" ON "cargo_charges"("trackingLegId");
CREATE INDEX "cargo_charges_invoiceId_idx" ON "cargo_charges"("invoiceId");

CREATE TABLE "cargo_files" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shipmentId" TEXT NOT NULL,
  "packageId" TEXT,
  "invoiceId" TEXT,
  "kind" "CargoFileKind" NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cargo_files_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "cargo_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_files_packageId_shipmentId_fkey" FOREIGN KEY ("packageId", "shipmentId") REFERENCES "cargo_packages"("id", "shipmentId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_files_invoiceId_shipmentId_fkey" FOREIGN KEY ("invoiceId", "shipmentId") REFERENCES "cargo_invoices"("id", "shipmentId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargo_files_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 5242880 AND OCTET_LENGTH("data") = "sizeBytes"),
  CONSTRAINT "cargo_files_hash_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "cargo_files_package_photo_check" CHECK ("kind" NOT IN ('CONTENT_PHOTO', 'CARTON_PHOTO') OR "packageId" IS NOT NULL)
);
CREATE INDEX "cargo_files_shipmentId_kind_idx" ON "cargo_files"("shipmentId", "kind");
CREATE INDEX "cargo_files_packageId_idx" ON "cargo_files"("packageId");
CREATE INDEX "cargo_files_invoiceId_idx" ON "cargo_files"("invoiceId");

INSERT INTO "permissions" ("key", "module", "description") VALUES
  ('cargo.view', 'cargo', 'View Cargo shipments, packages, tracking and reference data'),
  ('cargo.costs.view', 'cargo', 'View Cargo charges and invoices'),
  ('cargo.costs.manage', 'cargo', 'Manage Cargo charges and invoices'),
  ('cargo.documents.view', 'cargo', 'View Cargo documents and photos'),
  ('cargo.documents.manage', 'cargo', 'Manage Cargo documents and photos'),
  ('cargo.reference.manage', 'cargo', 'Manage Cargo forwarders, source warehouses and couriers'),
  ('cargo.shipments.manage', 'cargo', 'Create and edit Cargo shipments'),
  ('cargo.packages.manage', 'cargo', 'Create and edit Cargo packages and packing lists'),
  ('cargo.milestones.post', 'cargo', 'Post Cargo journey milestones'),
  ('cargo.tracking.manage', 'cargo', 'Create and update Cargo tracking legs');

INSERT INTO "access_groups" ("id", "name", "description", "isSystem") VALUES
  ('cargo_admin', 'Cargo Admin', 'All Cargo actions', true),
  ('cargo_operator', 'Cargo Operator', 'Manage shipments, packages and journey updates', true),
  ('cargo_viewer', 'Cargo Viewer', 'Read-only Cargo access', true);

INSERT INTO "access_group_permissions" ("groupId", "permissionKey")
SELECT 'flux_admin', "key" FROM "permissions" WHERE "module" = 'cargo';
INSERT INTO "access_group_permissions" ("groupId", "permissionKey") VALUES
  ('viewer', 'cargo.view'),
  ('viewer', 'cargo.costs.view'),
  ('viewer', 'cargo.documents.view'),
  ('cargo_viewer', 'cargo.view'),
  ('cargo_viewer', 'cargo.costs.view'),
  ('cargo_viewer', 'cargo.documents.view');
INSERT INTO "access_group_permissions" ("groupId", "permissionKey")
SELECT 'cargo_admin', "key" FROM "permissions" WHERE "module" = 'cargo';
INSERT INTO "access_group_permissions" ("groupId", "permissionKey")
SELECT 'cargo_operator', "key" FROM "permissions" WHERE "module" = 'cargo' AND "key" <> 'cargo.reference.manage';

COMMIT;
