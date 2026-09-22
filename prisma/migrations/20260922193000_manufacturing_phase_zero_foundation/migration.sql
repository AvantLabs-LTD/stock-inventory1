-- Manufacturing Phase 0: additive shared foundations only. Existing Vault and
-- Cargo history remains valid; no historical audit or request-key records are
-- fabricated.

CREATE TABLE "api_request_keys" (
  "actor_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_request_keys_pkey" PRIMARY KEY ("actor_id", "key"),
  CONSTRAINT "api_request_keys_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "api_request_keys_hash_check" CHECK ("requestHash" ~ '^[a-f0-9]{64}$')
);

CREATE INDEX "api_request_keys_createdAt_idx" ON "api_request_keys"("createdAt");

ALTER TABLE "audit_logs"
  ADD COLUMN "rootEntityType" TEXT,
  ADD COLUMN "rootEntityId" TEXT,
  ADD COLUMN "metadata" JSONB;

CREATE INDEX "audit_logs_entityType_entityId_date_idx"
  ON "audit_logs"("entityType", "entityId", "date" DESC);
CREATE INDEX "audit_logs_rootEntityType_rootEntityId_date_idx"
  ON "audit_logs"("rootEntityType", "rootEntityId", "date" DESC);

INSERT INTO "permissions" ("key", "module", "description") VALUES
  ('manufacturing.view', 'manufacturing', 'View manufacturing plans, orders, and production progress'),
  ('manufacturing.definitions.manage', 'manufacturing', 'Manage manufacturing profiles, BOMs, routes, operations, work centers, resources, and serial rules'),
  ('manufacturing.plans.manage', 'manufacturing', 'Create and manage production plans'),
  ('manufacturing.orders.manage', 'manufacturing', 'Create, edit, cancel, complete, and close production orders'),
  ('manufacturing.orders.release', 'manufacturing', 'Release a production order against immutable definition snapshots'),
  ('manufacturing.execution.view', 'manufacturing', 'View production-floor work and WIP'),
  ('manufacturing.execution.start', 'manufacturing', 'Start a production operation run'),
  ('manufacturing.execution.post', 'manufacturing', 'Move production quantities through permitted stages'),
  ('manufacturing.holds.manage', 'manufacturing', 'Place or release manufacturing quality holds'),
  ('manufacturing.rework.post', 'manufacturing', 'Post permitted manufacturing rework movements'),
  ('manufacturing.scrap.post', 'manufacturing', 'Post manufacturing scrap with a reason'),
  ('manufacturing.wip.adjust', 'manufacturing', 'Post auditable WIP corrections'),
  ('manufacturing.units.finalize', 'manufacturing', 'Finalize serialized production units'),
  ('manufacturing.materials.reserve', 'manufacturing', 'Reserve inventory for a production order'),
  ('manufacturing.materials.issue', 'manufacturing', 'Issue inventory into production'),
  ('manufacturing.materials.return', 'manufacturing', 'Return unused production inventory'),
  ('quality.templates.manage', 'quality', 'Manage quality templates and parameters'),
  ('quality.inspect', 'quality', 'Perform manufacturing quality inspections'),
  ('quality.holds.manage', 'quality', 'Place, release, and disposition quality holds'),
  ('delivery.view', 'delivery', 'View production deliveries'),
  ('delivery.manage', 'delivery', 'Create and manage production deliveries');

INSERT INTO "access_groups" ("id", "name", "description", "isSystem") VALUES
  ('manufacturing_operator', 'Manufacturing Operator', 'Perform authorized production-floor work', true),
  ('manufacturing_hod', 'Manufacturing HOD', 'Manage production execution and orders', true),
  ('manufacturing_admin', 'Manufacturing Admin', 'Manage manufacturing definitions and operations', true),
  ('manufacturing_inventory', 'Manufacturing Inventory', 'Reserve, issue, and return production materials', true),
  ('quality_operator', 'Quality', 'Perform and disposition production quality inspections', true),
  ('delivery_manager', 'Delivery Manager', 'Manage production deliveries', true);

INSERT INTO "access_group_permissions" ("groupId", "permissionKey") VALUES
  ('manufacturing_operator', 'manufacturing.view'),
  ('manufacturing_operator', 'manufacturing.execution.view'),
  ('manufacturing_operator', 'manufacturing.execution.start'),
  ('manufacturing_operator', 'manufacturing.execution.post'),
  ('manufacturing_hod', 'manufacturing.view'),
  ('manufacturing_hod', 'manufacturing.plans.manage'),
  ('manufacturing_hod', 'manufacturing.orders.manage'),
  ('manufacturing_hod', 'manufacturing.orders.release'),
  ('manufacturing_hod', 'manufacturing.execution.view'),
  ('manufacturing_hod', 'manufacturing.execution.start'),
  ('manufacturing_hod', 'manufacturing.execution.post'),
  ('manufacturing_hod', 'manufacturing.holds.manage'),
  ('manufacturing_hod', 'manufacturing.rework.post'),
  ('manufacturing_hod', 'manufacturing.scrap.post'),
  ('manufacturing_hod', 'manufacturing.wip.adjust'),
  ('manufacturing_hod', 'manufacturing.units.finalize'),
  ('manufacturing_inventory', 'manufacturing.view'),
  ('manufacturing_inventory', 'manufacturing.materials.reserve'),
  ('manufacturing_inventory', 'manufacturing.materials.issue'),
  ('manufacturing_inventory', 'manufacturing.materials.return'),
  ('quality_operator', 'manufacturing.view'),
  ('quality_operator', 'manufacturing.execution.view'),
  ('quality_operator', 'quality.inspect'),
  ('quality_operator', 'quality.holds.manage'),
  ('delivery_manager', 'delivery.view'),
  ('delivery_manager', 'delivery.manage');

INSERT INTO "access_group_permissions" ("groupId", "permissionKey")
SELECT 'manufacturing_admin', "key"
FROM "permissions"
WHERE "module" IN ('manufacturing', 'quality', 'delivery');

INSERT INTO "access_group_permissions" ("groupId", "permissionKey")
SELECT 'flux_admin', "key"
FROM "permissions"
WHERE "module" IN ('manufacturing', 'quality', 'delivery');
