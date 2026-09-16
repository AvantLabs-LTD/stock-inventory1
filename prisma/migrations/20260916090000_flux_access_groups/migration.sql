-- Flux access control: stable action permissions, reusable groups, and
-- membership backfilled from the legacy Store role. The role column remains
-- temporarily for compatibility with older clients and migration tooling.
BEGIN;

CREATE TABLE "permissions" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "module" TEXT NOT NULL,
  "description" TEXT NOT NULL
);

CREATE TABLE "access_groups" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE "access_group_permissions" (
  "groupId" TEXT NOT NULL,
  "permissionKey" TEXT NOT NULL,
  PRIMARY KEY ("groupId", "permissionKey"),
  CONSTRAINT "access_group_permissions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "access_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "access_group_permissions_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "user_access_groups" (
  "userId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  PRIMARY KEY ("userId", "groupId"),
  CONSTRAINT "user_access_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_access_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "access_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "permissions" ("key","module","description") VALUES
  ('flux.users.manage','flux','Create users and manage group membership'),
  ('flux.audit.view','flux','Read the ERP audit log'),
  ('vault.overview.view','vault','View Vault overview'),
  ('vault.catalogue.view','vault','View the component catalogue'),
  ('vault.catalogue.manage','vault','Create and edit components'),
  ('vault.catalogue.import','vault','Import and reconcile component data'),
  ('vault.stock.view','vault','View stock balances and movements'),
  ('vault.stock.adjust','vault','Post stock intake, count, and adjustment'),
  ('vault.demands.view','vault','View demands'),
  ('vault.demands.create','vault','Submit demands'),
  ('vault.demands.manage','vault','Edit and cancel demands'),
  ('vault.demands.approve','vault','Approve demand quantities and splits'),
  ('vault.demands.issue','vault','Issue stock to demands'),
  ('vault.demands.return','vault','Return issued stock'),
  ('vault.purchasing.view','vault','View legacy purchase requests'),
  ('vault.purchasing.manage','vault','Create and manage legacy purchase requests'),
  ('vault.purchasing.approve','vault','Approve legacy purchase orders'),
  ('vault.purchasing.receive','vault','Post purchase goods receipts'),
  ('vault.documents.view','vault','View purchase and receipt documents'),
  ('vault.documents.manage','vault','Upload or remove purchase documents'),
  ('vault.reference.view','vault','View Store reference data'),
  ('vault.reference.manage','vault','Manage Store reference data');

INSERT INTO "access_groups" ("id","name","description","isSystem") VALUES
  ('flux_admin','Flux Admin','Full ERP administration and all currently implemented Vault actions',true),
  ('viewer','Viewer','Read-only access to operational Vault information',true),
  ('vault_admin','Vault Admin','All Vault actions, including purchase approval',true),
  ('vault_manager','Vault Manager','Legacy inventory-manager actions without purchase approval',true),
  ('vault_purchase_approver','Purchase Approver','View Vault and approve purchase orders',true),
  ('vault_requester','Vault Requester','View Vault and submit demands',true);

INSERT INTO "access_group_permissions" ("groupId","permissionKey")
SELECT 'flux_admin',"key" FROM "permissions";
INSERT INTO "access_group_permissions" ("groupId","permissionKey")
SELECT 'vault_admin',"key" FROM "permissions" WHERE "module"='vault';
INSERT INTO "access_group_permissions" ("groupId","permissionKey")
SELECT 'viewer',"key" FROM "permissions" WHERE "key" IN (
  'vault.overview.view','vault.catalogue.view','vault.stock.view','vault.demands.view',
  'vault.purchasing.view','vault.documents.view','vault.reference.view'
);
INSERT INTO "access_group_permissions" ("groupId","permissionKey")
SELECT 'vault_manager',"key" FROM "permissions" WHERE "module"='vault' AND "key"<>'vault.purchasing.approve';
INSERT INTO "access_group_permissions" ("groupId","permissionKey")
SELECT 'vault_purchase_approver',"permissionKey" FROM "access_group_permissions" WHERE "groupId"='viewer';
INSERT INTO "access_group_permissions" ("groupId","permissionKey") VALUES
  ('vault_purchase_approver','vault.purchasing.approve');
INSERT INTO "access_group_permissions" ("groupId","permissionKey")
SELECT 'vault_requester',"permissionKey" FROM "access_group_permissions" WHERE "groupId"='viewer';
INSERT INTO "access_group_permissions" ("groupId","permissionKey") VALUES
  ('vault_requester','vault.demands.create');

INSERT INTO "user_access_groups" ("userId","groupId")
SELECT "id", CASE "role"
  WHEN 'SUPER_ADMIN' THEN 'flux_admin'
  WHEN 'INVENTORY_MANAGER' THEN 'vault_manager'
  WHEN 'PURCHASE_APPROVER' THEN 'vault_purchase_approver'
  ELSE 'vault_requester'
END FROM "User";

COMMIT;
