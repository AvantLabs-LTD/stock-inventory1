CREATE TABLE "item_alternative_groups" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "item_alternative_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "item_alternative_memberships" (
  "groupId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "item_alternative_memberships_pkey" PRIMARY KEY ("groupId", "itemId")
);

CREATE TABLE "item_merges" (
  "id" TEXT NOT NULL,
  "sourceItemId" TEXT NOT NULL,
  "targetItemId" TEXT NOT NULL,
  "moveBalance" BOOLEAN NOT NULL DEFAULT false,
  "moveBomLines" BOOLEAN NOT NULL DEFAULT false,
  "moveOpenDemand" BOOLEAN NOT NULL DEFAULT false,
  "moveOpenPurchases" BOOLEAN NOT NULL DEFAULT false,
  "remarks" TEXT,
  "mergedById" TEXT NOT NULL,
  "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "item_merges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "item_alternative_groups_name_key" ON "item_alternative_groups"("name");
CREATE INDEX "item_alternative_memberships_itemId_idx" ON "item_alternative_memberships"("itemId");
CREATE UNIQUE INDEX "item_merges_sourceItemId_key" ON "item_merges"("sourceItemId");
CREATE INDEX "item_merges_targetItemId_idx" ON "item_merges"("targetItemId");

ALTER TABLE "item_alternative_groups" ADD CONSTRAINT "item_alternative_groups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_alternative_memberships" ADD CONSTRAINT "item_alternative_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "item_alternative_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "item_alternative_memberships" ADD CONSTRAINT "item_alternative_memberships_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_merges" ADD CONSTRAINT "item_merges_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_merges" ADD CONSTRAINT "item_merges_targetItemId_fkey" FOREIGN KEY ("targetItemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_merges" ADD CONSTRAINT "item_merges_mergedById_fkey" FOREIGN KEY ("mergedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
