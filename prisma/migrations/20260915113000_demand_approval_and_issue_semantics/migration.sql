-- Demand approval is the stored decision; allocation is derived from the
-- approved-from-stock quantity that has not yet been issued.

ALTER TYPE "InventoryLedgerEntryType" RENAME VALUE 'ALLOCATION' TO 'ISSUE';

CREATE TYPE "DemandApprovalRevisionType" AS ENUM (
  'MANAGER_ADJUSTMENT',
  'PROCUREMENT_TO_STOCK',
  'RETURN_NO_REPLACEMENT',
  'CANCELLATION'
);
CREATE TYPE "ReturnDisposition" AS ENUM ('REPLACEMENT_REQUIRED', 'REDUCE_APPROVED_QUANTITY');

ALTER TABLE "demand_lines"
  ADD COLUMN "approvedQuantity" DECIMAL(18,6),
  ADD COLUMN "approvedFromStockQuantity" DECIMAL(18,6),
  ADD COLUMN "approvedForProcurementQuantity" DECIMAL(18,6),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvalRemarks" TEXT;

ALTER TABLE "demand_return_lines"
  ADD COLUMN "disposition" "ReturnDisposition" NOT NULL DEFAULT 'REPLACEMENT_REQUIRED';

CREATE TABLE "demand_approval_revisions" (
  "id" TEXT NOT NULL,
  "demandLineId" TEXT NOT NULL,
  "type" "DemandApprovalRevisionType" NOT NULL,
  "approvedQuantityDelta" DECIMAL(18,6) NOT NULL,
  "fromStockQuantityDelta" DECIMAL(18,6) NOT NULL,
  "forProcurementQuantityDelta" DECIMAL(18,6) NOT NULL,
  "returnLineId" TEXT,
  "sourceId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "demand_approval_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "demand_approval_revisions_returnLineId_key" ON "demand_approval_revisions"("returnLineId");
CREATE UNIQUE INDEX "demand_approval_revisions_sourceId_key" ON "demand_approval_revisions"("sourceId");
CREATE INDEX "demand_approval_revisions_demandLineId_createdAt_idx" ON "demand_approval_revisions"("demandLineId", "createdAt");
CREATE INDEX "demand_lines_approvedById_idx" ON "demand_lines"("approvedById");

ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_approval_revisions" ADD CONSTRAINT "demand_approval_revisions_demandLineId_fkey"
  FOREIGN KEY ("demandLineId") REFERENCES "demand_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_approval_revisions" ADD CONSTRAINT "demand_approval_revisions_returnLineId_fkey"
  FOREIGN KEY ("returnLineId") REFERENCES "demand_return_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_approval_revisions" ADD CONSTRAINT "demand_approval_revisions_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_approval_quantities"
  CHECK (
    ("approvedAt" IS NULL AND "approvedQuantity" IS NULL AND "approvedFromStockQuantity" IS NULL AND "approvedForProcurementQuantity" IS NULL AND "approvedById" IS NULL)
    OR
    ("approvedAt" IS NOT NULL AND "approvedQuantity" >= 0 AND "approvedFromStockQuantity" >= 0 AND "approvedForProcurementQuantity" >= 0
      AND "approvedQuantity" = "approvedFromStockQuantity" + "approvedForProcurementQuantity" AND "approvedById" IS NOT NULL)
  );
ALTER TABLE "demand_approval_revisions" ADD CONSTRAINT "demand_approval_revision_balanced"
  CHECK ("approvedQuantityDelta" = "fromStockQuantityDelta" + "forProcurementQuantityDelta");

-- Existing reservation decisions become the initial approved-from-stock fact.
-- Existing stock-out allocation records are issues; purchase links become the
-- evidence for the initial procurement portion. Records with no manager action
-- remain pending approval.
WITH historical AS (
  SELECT dl."id",
    GREATEST(
      COALESCE((SELECT SUM(CASE WHEN r."type"='RESERVE' THEN r."quantity" ELSE -r."quantity" END)
                FROM "demand_reservation_entries" r WHERE r."demandLineId"=dl."id"),0),
      COALESCE((SELECT SUM(i."quantity") FROM "demand_allocation_lines" i WHERE i."demandLineId"=dl."id"),0)
    ) AS stock_qty,
    COALESCE((SELECT SUM(l."quantity") FROM "demand_purchase_links" l WHERE l."demandLineId"=dl."id"),0) AS procurement_qty,
    COALESCE(
      (SELECT r."createdById" FROM "demand_reservation_entries" r WHERE r."demandLineId"=dl."id" ORDER BY r."createdAt" LIMIT 1),
      (SELECT a."postedById" FROM "demand_allocation_lines" i JOIN "demand_allocations" a ON a."id"=i."allocationId" WHERE i."demandLineId"=dl."id" ORDER BY a."postedAt" LIMIT 1),
      d."startedById", d."requestedById"
    ) AS actor_id,
    COALESCE(
      (SELECT MIN(r."createdAt") FROM "demand_reservation_entries" r WHERE r."demandLineId"=dl."id"),
      (SELECT MIN(a."postedAt") FROM "demand_allocation_lines" i JOIN "demand_allocations" a ON a."id"=i."allocationId" WHERE i."demandLineId"=dl."id"),
      (SELECT MIN(l."createdAt") FROM "demand_purchase_links" l WHERE l."demandLineId"=dl."id")
    ) AS decision_at
  FROM "demand_lines" dl JOIN "demands" d ON d."id"=dl."demandId"
)
UPDATE "demand_lines" dl SET
  "approvedQuantity"=h.stock_qty+h.procurement_qty,
  "approvedFromStockQuantity"=h.stock_qty,
  "approvedForProcurementQuantity"=h.procurement_qty,
  "approvedById"=h.actor_id,
  "approvedAt"=h.decision_at,
  "approvalRemarks"='Migrated from historical reservation, issue, and purchase-link decisions'
FROM historical h
WHERE dl."id"=h."id" AND h.decision_at IS NOT NULL;

DROP VIEW "demand_line_supply";
DROP VIEW "demand_line_quantities";

CREATE VIEW "demand_line_quantities" AS
WITH revisions AS (
  SELECT "demandLineId",
    COALESCE(SUM("approvedQuantityDelta"),0) approved_delta,
    COALESCE(SUM("fromStockQuantityDelta"),0) stock_delta,
    COALESCE(SUM("forProcurementQuantityDelta"),0) procurement_delta
  FROM "demand_approval_revisions" GROUP BY "demandLineId"
), issues AS (
  SELECT "demandLineId", COALESCE(SUM("quantity"),0) issued
  FROM "demand_allocation_lines" GROUP BY "demandLineId"
), returns AS (
  SELECT i."demandLineId", COALESCE(SUM(r."quantity"),0) returned
  FROM "demand_return_lines" r JOIN "demand_allocation_lines" i ON i."id"=r."allocationLineId"
  GROUP BY i."demandLineId"
), procurement AS (
  SELECT l."demandLineId",
    COALESCE(SUM(CASE WHEN p."status"='BACKLOG' THEN l."quantity" ELSE 0 END),0) backlog,
    COALESCE(SUM(CASE WHEN p."status"='PENDING_ORDER_APPROVAL' THEN l."quantity" ELSE 0 END),0) pending_approval,
    COALESCE(SUM(CASE WHEN p."status"='ORDERED' THEN l."quantity" ELSE 0 END),0) ordered,
    COALESCE(SUM(CASE WHEN p."status"='SHIPPED' THEN l."quantity" ELSE 0 END),0) shipped
  FROM "demand_purchase_links" l
  JOIN "purchase_request_lines" pl ON pl."id"=l."purchaseRequestLineId"
  JOIN "purchase_requests" p ON p."id"=pl."purchaseRequestId"
  GROUP BY l."demandLineId"
), facts AS (
  SELECT dl.*,
    GREATEST(COALESCE(dl."approvedQuantity",0)+COALESCE(rv.approved_delta,0),0) approved,
    GREATEST(COALESCE(dl."approvedFromStockQuantity",0)+COALESCE(rv.stock_delta,0),0) approved_stock,
    GREATEST(COALESCE(dl."approvedForProcurementQuantity",0)+COALESCE(rv.procurement_delta,0),0) approved_procurement,
    COALESCE(i.issued,0) issued,
    COALESCE(rt.returned,0) returned,
    GREATEST(COALESCE(i.issued,0)-COALESCE(rt.returned,0),0) net_issued
  FROM "demand_lines" dl
  LEFT JOIN revisions rv ON rv."demandLineId"=dl."id"
  LEFT JOIN issues i ON i."demandLineId"=dl."id"
  LEFT JOIN returns rt ON rt."demandLineId"=dl."id"
)
SELECT f."id" "demandLineId", f."demandId", f."itemId",
  f."requiredQuantity" required, f."requiredQuantity" requested,
  f.approved, f.approved_stock "approvedFromStock", f.approved_procurement "approvedForProcurement",
  GREATEST(f.approved_stock-f.net_issued,0) allocated,
  GREATEST(f.approved_stock-f.net_issued,0) reserved,
  f.issued, f.returned, f.net_issued "netIssued",
  GREATEST(f.approved-f.net_issued,0) remaining,
  GREATEST(f."requiredQuantity"-f.approved,0) cancelled,
  COALESCE(p.backlog,0) backlog, COALESCE(p.pending_approval,0) "pendingApproval",
  COALESCE(p.ordered,0) ordered, COALESCE(p.shipped,0) shipped,
  CASE
    WHEN f."approvedAt" IS NULL THEN 'PENDING_APPROVAL'
    WHEN f.approved=0 THEN 'CANCELLED'
    WHEN f.net_issued>=f.approved THEN 'ISSUED'
    WHEN f.net_issued>0 THEN 'PARTIALLY_ISSUED'
    WHEN GREATEST(f.approved_stock-f.net_issued,0)>=GREATEST(f.approved-f.net_issued,0) THEN 'AVAILABLE'
    ELSE 'PENDING'
  END "fulfilmentFacet"
FROM facts f LEFT JOIN procurement p ON p."demandLineId"=f."id";

CREATE VIEW "demand_line_supply" AS
SELECT q.*,
  GREATEST(q.remaining-q.allocated,0) "physicalDeficit",
  GREATEST(q.remaining-q.allocated-q.backlog-q."pendingApproval"-q.ordered-q.shipped,0) "unprocuredDeficit",
  CASE
    WHEN q."fulfilmentFacet"='PENDING_APPROVAL' THEN 'PENDING_APPROVAL'
    WHEN q.remaining=0 THEN 'COMPLETE'
    WHEN q.allocated>=q.remaining THEN 'AVAILABLE'
    WHEN q.allocated>0 THEN 'PARTIALLY_AVAILABLE'
    ELSE 'PROCUREMENT_REQUIRED'
  END "stockFacet"
FROM "demand_line_quantities" q;

-- Rebuild the balance cache from the new derived allocation definition. This
-- also re-allocates historically returned stock because legacy returns did not
-- record whether a replacement was still required.
UPDATE "item_balances" b SET
  "reserved"=COALESCE((SELECT SUM(q.allocated) FROM "demand_line_quantities" q WHERE q."itemId"=b."itemId"),0),
  "version"=b."version"+1,
  "updatedAt"=CURRENT_TIMESTAMP;
