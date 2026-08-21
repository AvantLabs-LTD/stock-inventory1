-- Catalogue taxonomy and request-line procurement semantics.
-- The installation has no legacy business data, so obsolete classifications are removed directly.

CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'INVENTORY_MANAGER', 'PURCHASE_APPROVER', 'USER');
CREATE TYPE "ProcurementType" AS ENUM ('FOREIGN_STANDARD', 'FOREIGN_MANUFACTURED', 'LOCAL_STANDARD', 'LOCAL_MANUFACTURED');
CREATE TYPE "ItemCatalogueState" AS ENUM ('COMPLETE', 'INCOMPLETE');

ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

CREATE TABLE "item_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "discipline" "ItemDiscipline" NOT NULL,
    "parentId" TEXT,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "item_categories_parentId_normalizedName_key" ON "item_categories"("parentId", "normalizedName");
CREATE UNIQUE INDEX "item_categories_root_normalizedName_key" ON "item_categories"("normalizedName") WHERE "parentId" IS NULL;
CREATE INDEX "item_categories_discipline_status_sortOrder_idx" ON "item_categories"("discipline", "status", "sortOrder");
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "items" DROP CONSTRAINT "items_defaultClassificationId_fkey";
ALTER TABLE "items"
  DROP COLUMN "defaultClassificationId",
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "catalogueState" "ItemCatalogueState" NOT NULL DEFAULT 'COMPLETE',
  ADD COLUMN "specification" TEXT,
  ADD COLUMN "manufacturerName" TEXT,
  ADD COLUMN "manufacturerPartNumber" TEXT,
  ADD COLUMN "supplierPartNumber" TEXT,
  ADD COLUMN "importSourceKey" TEXT;

CREATE UNIQUE INDEX "items_importSourceKey_key" ON "items"("importSourceKey");
CREATE INDEX "items_categoryId_status_idx" ON "items"("categoryId", "status");
CREATE INDEX "items_manufacturerPartNumber_idx" ON "items"("manufacturerPartNumber");
CREATE INDEX "items_supplierPartNumber_idx" ON "items"("supplierPartNumber");
ALTER TABLE "items" ADD CONSTRAINT "items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "demand_lines" DROP CONSTRAINT "demand_lines_classificationId_fkey";
ALTER TABLE "demand_lines"
  DROP COLUMN "classificationId",
  ADD COLUMN "suggestedCategoryId" TEXT,
  ADD COLUMN "procurementType" "ProcurementType";
CREATE INDEX "demand_lines_suggestedCategoryId_idx" ON "demand_lines"("suggestedCategoryId");
ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_suggestedCategoryId_fkey" FOREIGN KEY ("suggestedCategoryId") REFERENCES "item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_request_lines" DROP CONSTRAINT "purchase_request_lines_classificationId_fkey";
ALTER TABLE "purchase_request_lines"
  DROP COLUMN "classificationId",
  ADD COLUMN "type" "ProcurementType" NOT NULL;

DROP TABLE "item_classifications";

INSERT INTO "item_categories" ("id", "name", "normalizedName", "discipline", "sortOrder", "createdAt", "updatedAt") VALUES
  ('cat_mech_standard', 'Standard Mechanical Hardware', 'standard mechanical hardware', 'MECHANICAL', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat_mech_local_mfr', 'Locally Manufactured Mechanical Parts', 'locally manufactured mechanical parts', 'MECHANICAL', 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat_elec_pcb_components', 'PCB Components', 'pcb components', 'ELECTRONICS', 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat_elec_pcbs', 'PCBs', 'pcbs', 'ELECTRONICS', 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat_elec_metal_connectors', 'Metal Connectors', 'metal connectors', 'ELECTRONICS', 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat_elec_aux', 'Auxiliary & Harness Supplies', 'auxiliary & harness supplies', 'ELECTRONICS', 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
