-- Manufacturing Phase 1: reusable definition records only. No order, WIP,
-- inventory, serial, quality, or delivery facts are introduced in this step.

CREATE TYPE "SupplyMode" AS ENUM ('BUY', 'MAKE', 'MAKE_OR_BUY');
CREATE TYPE "TrackingMode" AS ENUM ('QUANTITY', 'LOT', 'SERIAL');
CREATE TYPE "DefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "ProductionResourceType" AS ENUM (
  'CNC_MACHINE', 'LATHE', 'MILL', 'THREE_D_PRINTER', 'REFLOW_OVEN',
  'TEST_BENCH', 'ASSEMBLY_STATION', 'OTHER'
);
CREATE TYPE "ProductionResourceStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'RETIRED');
CREATE TYPE "RouteExecutionMode" AS ENUM ('INTERNAL', 'SUBCONTRACTED');
CREATE TYPE "RouteTransitionType" AS ENUM ('NORMAL', 'REWORK', 'ALTERNATIVE');
CREATE TYPE "RouteStepRequirementType" AS ENUM (
  'OPERATOR', 'RESOURCE', 'VENDOR', 'MATERIAL_LOT', 'QUALITY_INSPECTION',
  'TEXT', 'NUMBER', 'DATE'
);
CREATE TYPE "RouteStepRequirementCapturePoint" AS ENUM ('START', 'COMPLETE', 'TRANSITION');

CREATE TABLE "work_centers" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "work_centers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_centers_code_nonblank" CHECK (NULLIF(BTRIM("code"), '') IS NOT NULL),
  CONSTRAINT "work_centers_name_nonblank" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL)
);

CREATE UNIQUE INDEX "work_centers_code_key" ON "work_centers"("code");
CREATE INDEX "work_centers_status_name_idx" ON "work_centers"("status", "name");

CREATE TABLE "production_resources" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "resourceType" "ProductionResourceType" NOT NULL,
  "workCenterId" TEXT,
  "status" "ProductionResourceStatus" NOT NULL DEFAULT 'AVAILABLE',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_resources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "production_resources_code_nonblank" CHECK (NULLIF(BTRIM("code"), '') IS NOT NULL),
  CONSTRAINT "production_resources_name_nonblank" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
  CONSTRAINT "production_resources_workCenterId_fkey"
    FOREIGN KEY ("workCenterId") REFERENCES "work_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "production_resources_code_key" ON "production_resources"("code");
CREATE INDEX "production_resources_workCenterId_status_idx" ON "production_resources"("workCenterId", "status");
CREATE INDEX "production_resources_resourceType_status_idx" ON "production_resources"("resourceType", "status");

CREATE TABLE "manufacturing_operations" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "defaultWorkCenterId" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "manufacturing_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manufacturing_operations_code_nonblank" CHECK (NULLIF(BTRIM("code"), '') IS NOT NULL),
  CONSTRAINT "manufacturing_operations_name_nonblank" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
  CONSTRAINT "manufacturing_operations_defaultWorkCenterId_fkey"
    FOREIGN KEY ("defaultWorkCenterId") REFERENCES "work_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "manufacturing_operations_code_key" ON "manufacturing_operations"("code");
CREATE INDEX "manufacturing_operations_status_name_idx" ON "manufacturing_operations"("status", "name");

CREATE TABLE "bill_of_materials" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "projectTagId" TEXT,
  "name" TEXT NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bill_of_materials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bill_of_materials_name_nonblank" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
  CONSTRAINT "bill_of_materials_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bill_of_materials_projectTagId_fkey"
    FOREIGN KEY ("projectTagId") REFERENCES "project_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bill_of_materials_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "bill_of_materials_itemId_status_idx" ON "bill_of_materials"("itemId", "status");
CREATE INDEX "bill_of_materials_projectTagId_status_idx" ON "bill_of_materials"("projectTagId", "status");

CREATE TABLE "bom_versions" (
  "id" TEXT NOT NULL,
  "bomId" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "status" "DefinitionStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bom_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bom_versions_revision_nonblank" CHECK (NULLIF(BTRIM("revision"), '') IS NOT NULL),
  CONSTRAINT "bom_versions_effectivity_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "bom_versions_approval_pair_check" CHECK (("approvedAt" IS NULL) = ("approvedById" IS NULL)),
  CONSTRAINT "bom_versions_bomId_fkey"
    FOREIGN KEY ("bomId") REFERENCES "bill_of_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bom_versions_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bom_versions_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "bom_versions_bomId_revision_key" ON "bom_versions"("bomId", "revision");
CREATE UNIQUE INDEX "bom_versions_one_active_per_bom" ON "bom_versions"("bomId") WHERE "status" = 'ACTIVE';
CREATE INDEX "bom_versions_status_effectiveFrom_effectiveTo_idx" ON "bom_versions"("status", "effectiveFrom", "effectiveTo");

CREATE TABLE "manufacturing_routes" (
  "id" TEXT NOT NULL,
  "itemId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "manufacturing_routes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manufacturing_routes_name_nonblank" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
  CONSTRAINT "manufacturing_routes_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "manufacturing_routes_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "manufacturing_routes_itemId_status_idx" ON "manufacturing_routes"("itemId", "status");

CREATE TABLE "route_versions" (
  "id" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "status" "DefinitionStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "route_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "route_versions_revision_nonblank" CHECK (NULLIF(BTRIM("revision"), '') IS NOT NULL),
  CONSTRAINT "route_versions_effectivity_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "route_versions_approval_pair_check" CHECK (("approvedAt" IS NULL) = ("approvedById" IS NULL)),
  CONSTRAINT "route_versions_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "manufacturing_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "route_versions_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "route_versions_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "route_versions_routeId_revision_key" ON "route_versions"("routeId", "revision");
CREATE UNIQUE INDEX "route_versions_one_active_per_route" ON "route_versions"("routeId") WHERE "status" = 'ACTIVE';
CREATE INDEX "route_versions_status_effectiveFrom_effectiveTo_idx" ON "route_versions"("status", "effectiveFrom", "effectiveTo");

CREATE TABLE "route_steps" (
  "id" TEXT NOT NULL,
  "routeVersionId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "nameOverride" TEXT,
  "workCenterId" TEXT,
  "executionMode" "RouteExecutionMode" NOT NULL DEFAULT 'INTERNAL',
  "isSerializationPoint" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "route_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "route_steps_sequence_check" CHECK ("sequence" >= 0),
  CONSTRAINT "route_steps_routeVersionId_fkey"
    FOREIGN KEY ("routeVersionId") REFERENCES "route_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "route_steps_operationId_fkey"
    FOREIGN KEY ("operationId") REFERENCES "manufacturing_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "route_steps_workCenterId_fkey"
    FOREIGN KEY ("workCenterId") REFERENCES "work_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "route_steps_id_routeVersionId_key" ON "route_steps"("id", "routeVersionId");
CREATE UNIQUE INDEX "route_steps_routeVersionId_sequence_key" ON "route_steps"("routeVersionId", "sequence");
CREATE UNIQUE INDEX "route_steps_one_serialization_point" ON "route_steps"("routeVersionId") WHERE "isSerializationPoint";
CREATE INDEX "route_steps_operationId_idx" ON "route_steps"("operationId");
CREATE INDEX "route_steps_workCenterId_idx" ON "route_steps"("workCenterId");

CREATE TABLE "bom_lines" (
  "id" TEXT NOT NULL,
  "bomVersionId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "parentLineId" TEXT,
  "sourceLineKey" TEXT NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL,
  "unit" TEXT,
  "scrapAllowance" DECIMAL(18,6),
  "consumptionRouteStepId" TEXT,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bom_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bom_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "bom_lines_scrapAllowance_check" CHECK ("scrapAllowance" IS NULL OR "scrapAllowance" >= 0),
  CONSTRAINT "bom_lines_sortOrder_check" CHECK ("sortOrder" >= 0),
  CONSTRAINT "bom_lines_bomVersionId_fkey"
    FOREIGN KEY ("bomVersionId") REFERENCES "bom_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bom_lines_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bom_lines_parent_same_version_fkey"
    FOREIGN KEY ("parentLineId", "bomVersionId") REFERENCES "bom_lines"("id", "bomVersionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bom_lines_consumptionRouteStepId_fkey"
    FOREIGN KEY ("consumptionRouteStepId") REFERENCES "route_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "bom_lines_id_bomVersionId_key" ON "bom_lines"("id", "bomVersionId");
CREATE UNIQUE INDEX "bom_lines_bomVersionId_sourceLineKey_key" ON "bom_lines"("bomVersionId", "sourceLineKey");
CREATE INDEX "bom_lines_bomVersionId_sortOrder_idx" ON "bom_lines"("bomVersionId", "sortOrder");
CREATE INDEX "bom_lines_itemId_idx" ON "bom_lines"("itemId");

CREATE TABLE "route_transitions" (
  "id" TEXT NOT NULL,
  "routeVersionId" TEXT NOT NULL,
  "fromStepId" TEXT NOT NULL,
  "toStepId" TEXT NOT NULL,
  "transitionType" "RouteTransitionType" NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "route_transitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "route_transitions_distinct_steps_check" CHECK ("fromStepId" <> "toStepId"),
  CONSTRAINT "route_transitions_routeVersionId_fkey"
    FOREIGN KEY ("routeVersionId") REFERENCES "route_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "route_transitions_from_same_version_fkey"
    FOREIGN KEY ("fromStepId", "routeVersionId") REFERENCES "route_steps"("id", "routeVersionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "route_transitions_to_same_version_fkey"
    FOREIGN KEY ("toStepId", "routeVersionId") REFERENCES "route_steps"("id", "routeVersionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "route_transitions_routeVersionId_fromStepId_toStepId_transitionType_key"
  ON "route_transitions"("routeVersionId", "fromStepId", "toStepId", "transitionType");
CREATE INDEX "route_transitions_routeVersionId_fromStepId_idx" ON "route_transitions"("routeVersionId", "fromStepId");

CREATE TABLE "route_step_requirements" (
  "id" TEXT NOT NULL,
  "routeStepId" TEXT NOT NULL,
  "requirementType" "RouteStepRequirementType" NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "requiredAt" "RouteStepRequirementCapturePoint" NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "route_step_requirements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "route_step_requirements_key_nonblank" CHECK (NULLIF(BTRIM("key"), '') IS NOT NULL),
  CONSTRAINT "route_step_requirements_label_nonblank" CHECK (NULLIF(BTRIM("label"), '') IS NOT NULL),
  CONSTRAINT "route_step_requirements_sequence_check" CHECK ("sequence" >= 0),
  CONSTRAINT "route_step_requirements_routeStepId_fkey"
    FOREIGN KEY ("routeStepId") REFERENCES "route_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "route_step_requirements_routeStepId_key_key" ON "route_step_requirements"("routeStepId", "key");
CREATE INDEX "route_step_requirements_routeStepId_sequence_idx" ON "route_step_requirements"("routeStepId", "sequence");

CREATE TABLE "manufacturing_profiles" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "supplyMode" "SupplyMode" NOT NULL,
  "trackingMode" "TrackingMode" NOT NULL DEFAULT 'QUANTITY',
  "defaultBomVersionId" TEXT,
  "defaultRouteVersionId" TEXT,
  "traceInFinishedProduct" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "manufacturing_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manufacturing_profiles_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "manufacturing_profiles_defaultBomVersionId_fkey"
    FOREIGN KEY ("defaultBomVersionId") REFERENCES "bom_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "manufacturing_profiles_defaultRouteVersionId_fkey"
    FOREIGN KEY ("defaultRouteVersionId") REFERENCES "route_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "manufacturing_profiles_itemId_key" ON "manufacturing_profiles"("itemId");
