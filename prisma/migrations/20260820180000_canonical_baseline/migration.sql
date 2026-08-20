-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ItemDiscipline" AS ENUM ('MECHANICAL', 'ELECTRONICS');

-- CreateEnum
CREATE TYPE "DemandState" AS ENUM ('SUBMITTED', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationEntryType" AS ENUM ('RESERVE', 'RELEASE');

-- CreateEnum
CREATE TYPE "InventoryLedgerEntryType" AS ENUM ('OPENING', 'RECEIPT', 'ALLOCATION', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('BACKLOG', 'PENDING_APPROVAL', 'ORDERED', 'SHIPPED', 'RECEIVED_IN_STORE');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('RECEIPT', 'INVOICE', 'QUOTATION', 'SHIPPING_DOCUMENT', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_classifications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "remarks" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" "ItemDiscipline" NOT NULL,
    "description" TEXT,
    "function" TEXT,
    "link" TEXT,
    "optionSelection" TEXT,
    "remarks" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "defaultClassificationId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_balances" (
    "itemId" TEXT NOT NULL,
    "onHand" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_balances_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "demands" (
    "id" TEXT NOT NULL,
    "demandNo" TEXT NOT NULL,
    "state" "DemandState" NOT NULL DEFAULT 'SUBMITTED',
    "departmentTagId" TEXT,
    "requestedById" TEXT NOT NULL,
    "startedById" TEXT,
    "closedById" TEXT,
    "cancelledById" TEXT,
    "remarks" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_lines" (
    "id" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "itemId" TEXT,
    "projectTagId" TEXT,
    "classificationId" TEXT NOT NULL,
    "vendorId" TEXT,
    "itemCodeSnapshot" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "requiredQuantity" DECIMAL(18,6) NOT NULL,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_reservation_entries" (
    "id" TEXT NOT NULL,
    "demandLineId" TEXT NOT NULL,
    "type" "ReservationEntryType" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_reservation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_line_cancellations" (
    "id" TEXT NOT NULL,
    "demandLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_line_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_allocations" (
    "id" TEXT NOT NULL,
    "allocationNo" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "remarks" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_allocation_lines" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "demandLineId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_allocation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_returns" (
    "id" TEXT NOT NULL,
    "returnNo" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "reason" TEXT,
    "remarks" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_return_lines" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "allocationLineId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_ledger_entries" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InventoryLedgerEntryType" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "onHandAfter" DECIMAL(18,6) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLineId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "remarks" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'BACKLOG',
    "vendorId" TEXT,
    "trackingNumber" TEXT,
    "boxNumber" TEXT,
    "shippingDetails" TEXT,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "submittedAt" TIMESTAMP(3),
    "orderedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_lines" (
    "id" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_purchase_links" (
    "id" TEXT NOT NULL,
    "purchaseRequestLineId" TEXT NOT NULL,
    "demandLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_purchase_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "remarks" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purchaseRequestLineId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" TEXT NOT NULL,
    "adjustmentNo" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustment_lines" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_adjustment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "purchaseRequestId" TEXT,
    "goodsReceiptId" TEXT,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'OTHER',
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "department_tags_normalizedName_key" ON "department_tags"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "department_tags_code_key" ON "department_tags"("code");

-- CreateIndex
CREATE INDEX "department_tags_name_idx" ON "department_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "project_tags_normalizedName_key" ON "project_tags"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "project_tags_code_key" ON "project_tags"("code");

-- CreateIndex
CREATE INDEX "project_tags_name_idx" ON "project_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "item_classifications_normalizedName_key" ON "item_classifications"("normalizedName");

-- CreateIndex
CREATE INDEX "item_classifications_status_sortOrder_idx" ON "item_classifications"("status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_normalizedName_key" ON "vendors"("normalizedName");

-- CreateIndex
CREATE INDEX "vendors_name_idx" ON "vendors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "items_code_key" ON "items"("code");

-- CreateIndex
CREATE INDEX "items_title_idx" ON "items"("title");

-- CreateIndex
CREATE INDEX "items_status_idx" ON "items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "demands_demandNo_key" ON "demands"("demandNo");

-- CreateIndex
CREATE INDEX "demands_state_requestedAt_idx" ON "demands"("state", "requestedAt");

-- CreateIndex
CREATE INDEX "demands_requestedById_idx" ON "demands"("requestedById");

-- CreateIndex
CREATE INDEX "demand_lines_demandId_sortOrder_idx" ON "demand_lines"("demandId", "sortOrder");

-- CreateIndex
CREATE INDEX "demand_lines_itemId_idx" ON "demand_lines"("itemId");

-- CreateIndex
CREATE INDEX "demand_lines_projectTagId_idx" ON "demand_lines"("projectTagId");

-- CreateIndex
CREATE UNIQUE INDEX "demand_reservation_entries_sourceId_key" ON "demand_reservation_entries"("sourceId");

-- CreateIndex
CREATE INDEX "demand_reservation_entries_demandLineId_createdAt_idx" ON "demand_reservation_entries"("demandLineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "demand_line_cancellations_sourceId_key" ON "demand_line_cancellations"("sourceId");

-- CreateIndex
CREATE INDEX "demand_line_cancellations_demandLineId_createdAt_idx" ON "demand_line_cancellations"("demandLineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "demand_allocations_allocationNo_key" ON "demand_allocations"("allocationNo");

-- CreateIndex
CREATE UNIQUE INDEX "demand_allocations_idempotencyKey_key" ON "demand_allocations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "demand_allocations_demandId_postedAt_idx" ON "demand_allocations"("demandId", "postedAt");

-- CreateIndex
CREATE INDEX "demand_allocation_lines_allocationId_idx" ON "demand_allocation_lines"("allocationId");

-- CreateIndex
CREATE INDEX "demand_allocation_lines_demandLineId_idx" ON "demand_allocation_lines"("demandLineId");

-- CreateIndex
CREATE UNIQUE INDEX "demand_returns_returnNo_key" ON "demand_returns"("returnNo");

-- CreateIndex
CREATE UNIQUE INDEX "demand_returns_idempotencyKey_key" ON "demand_returns"("idempotencyKey");

-- CreateIndex
CREATE INDEX "demand_return_lines_allocationLineId_idx" ON "demand_return_lines"("allocationLineId");

-- CreateIndex
CREATE INDEX "inventory_ledger_entries_itemId_occurredAt_idx" ON "inventory_ledger_entries"("itemId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_ledger_entries_sourceType_sourceLineId_key" ON "inventory_ledger_entries"("sourceType", "sourceLineId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_requestNo_key" ON "purchase_requests"("requestNo");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_idempotencyKey_key" ON "purchase_requests"("idempotencyKey");

-- CreateIndex
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");

-- CreateIndex
CREATE INDEX "purchase_request_lines_purchaseRequestId_idx" ON "purchase_request_lines"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "purchase_request_lines_itemId_idx" ON "purchase_request_lines"("itemId");

-- CreateIndex
CREATE INDEX "demand_purchase_links_demandLineId_idx" ON "demand_purchase_links"("demandLineId");

-- CreateIndex
CREATE UNIQUE INDEX "demand_purchase_links_purchaseRequestLineId_demandLineId_key" ON "demand_purchase_links"("purchaseRequestLineId", "demandLineId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_receiptNo_key" ON "goods_receipts"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_idempotencyKey_key" ON "goods_receipts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_purchaseRequestLineId_idx" ON "goods_receipt_lines"("purchaseRequestLineId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustments_adjustmentNo_key" ON "inventory_adjustments"("adjustmentNo");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustments_idempotencyKey_key" ON "inventory_adjustments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "audit_logs_date_idx" ON "audit_logs"("date");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_defaultClassificationId_fkey" FOREIGN KEY ("defaultClassificationId") REFERENCES "item_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_balances" ADD CONSTRAINT "item_balances_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_departmentTagId_fkey" FOREIGN KEY ("departmentTagId") REFERENCES "department_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demands" ADD CONSTRAINT "demands_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "demands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_projectTagId_fkey" FOREIGN KEY ("projectTagId") REFERENCES "project_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "item_classifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_reservation_entries" ADD CONSTRAINT "demand_reservation_entries_demandLineId_fkey" FOREIGN KEY ("demandLineId") REFERENCES "demand_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_reservation_entries" ADD CONSTRAINT "demand_reservation_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_line_cancellations" ADD CONSTRAINT "demand_line_cancellations_demandLineId_fkey" FOREIGN KEY ("demandLineId") REFERENCES "demand_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_line_cancellations" ADD CONSTRAINT "demand_line_cancellations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_allocations" ADD CONSTRAINT "demand_allocations_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "demands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_allocations" ADD CONSTRAINT "demand_allocations_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_allocation_lines" ADD CONSTRAINT "demand_allocation_lines_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "demand_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_allocation_lines" ADD CONSTRAINT "demand_allocation_lines_demandLineId_fkey" FOREIGN KEY ("demandLineId") REFERENCES "demand_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_allocation_lines" ADD CONSTRAINT "demand_allocation_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_returns" ADD CONSTRAINT "demand_returns_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_return_lines" ADD CONSTRAINT "demand_return_lines_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "demand_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_return_lines" ADD CONSTRAINT "demand_return_lines_allocationLineId_fkey" FOREIGN KEY ("allocationLineId") REFERENCES "demand_allocation_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_return_lines" ADD CONSTRAINT "demand_return_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "item_classifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_purchase_links" ADD CONSTRAINT "demand_purchase_links_purchaseRequestLineId_fkey" FOREIGN KEY ("purchaseRequestLineId") REFERENCES "purchase_request_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_purchase_links" ADD CONSTRAINT "demand_purchase_links_demandLineId_fkey" FOREIGN KEY ("demandLineId") REFERENCES "demand_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchaseRequestLineId_fkey" FOREIGN KEY ("purchaseRequestLineId") REFERENCES "purchase_request_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_lines" ADD CONSTRAINT "inventory_adjustment_lines_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "inventory_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_lines" ADD CONSTRAINT "inventory_adjustment_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Domain invariants: positive event quantities and non-negative balance cache.
ALTER TABLE "item_balances" ADD CONSTRAINT "item_balances_nonnegative" CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "reserved" <= "onHand");
ALTER TABLE "demand_lines" ADD CONSTRAINT "demand_lines_positive_required" CHECK ("requiredQuantity" > 0);
ALTER TABLE "demand_reservation_entries" ADD CONSTRAINT "demand_reservations_positive" CHECK ("quantity" > 0);
ALTER TABLE "demand_line_cancellations" ADD CONSTRAINT "demand_cancellations_positive" CHECK ("quantity" > 0);
ALTER TABLE "demand_allocation_lines" ADD CONSTRAINT "demand_allocations_positive" CHECK ("quantity" > 0);
ALTER TABLE "demand_return_lines" ADD CONSTRAINT "demand_returns_positive" CHECK ("quantity" > 0);
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_lines_positive" CHECK ("quantity" > 0);
ALTER TABLE "demand_purchase_links" ADD CONSTRAINT "purchase_links_positive" CHECK ("quantity" > 0);
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "receipt_lines_positive" CHECK ("quantity" > 0);
ALTER TABLE "inventory_adjustment_lines" ADD CONSTRAINT "adjustments_nonzero" CHECK ("quantity" <> 0);
ALTER TABLE "attachments" ADD CONSTRAINT "attachment_owner_exactly_one" CHECK (num_nonnulls("purchaseRequestId", "goodsReceiptId") = 1);
ALTER TABLE "attachments" ADD CONSTRAINT "attachment_size_limit" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 5242880);

-- Defaults are data, not hard-coded enum values: administrators may rename or add classifications.
INSERT INTO "item_classifications" ("id","name","normalizedName","sortOrder","createdAt","updatedAt") VALUES
('class_foreign_standard','Foreign Standard Item','foreign standard item',10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('class_foreign_manufactured','Foreign Manufactured Item','foreign manufactured item',20,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('class_local_standard','Local Standard Item','local standard item',30,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('class_local_manufactured','Local Manufactured Item','local manufactured item',40,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('class_pcb_components','PCB & Components','pcb & components',50,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

-- One read model derives every operational quantity from immutable facts.
CREATE VIEW "demand_line_quantities" AS
WITH reservations AS (
  SELECT "demandLineId",
    COALESCE(SUM(CASE WHEN "type" = 'RESERVE' THEN "quantity" ELSE -"quantity" END),0) AS reserved_gross
  FROM "demand_reservation_entries" GROUP BY "demandLineId"
), allocations AS (
  SELECT "demandLineId", COALESCE(SUM("quantity"),0) AS allocated_gross
  FROM "demand_allocation_lines" GROUP BY "demandLineId"
), returns AS (
  SELECT al."demandLineId", COALESCE(SUM(r."quantity"),0) AS returned
  FROM "demand_return_lines" r JOIN "demand_allocation_lines" al ON al."id"=r."allocationLineId"
  GROUP BY al."demandLineId"
), cancellations AS (
  SELECT "demandLineId", COALESCE(SUM("quantity"),0) AS cancelled
  FROM "demand_line_cancellations" GROUP BY "demandLineId"
), procurement AS (
  SELECT l."demandLineId",
    COALESCE(SUM(CASE WHEN p."status"='BACKLOG' THEN l."quantity" ELSE 0 END),0) AS backlog,
    COALESCE(SUM(CASE WHEN p."status"='PENDING_APPROVAL' THEN l."quantity" ELSE 0 END),0) AS pending_approval,
    COALESCE(SUM(CASE WHEN p."status"='ORDERED' THEN l."quantity" ELSE 0 END),0) AS ordered,
    COALESCE(SUM(CASE WHEN p."status"='SHIPPED' THEN l."quantity" ELSE 0 END),0) AS shipped
  FROM "demand_purchase_links" l
  JOIN "purchase_request_lines" pl ON pl."id"=l."purchaseRequestLineId"
  JOIN "purchase_requests" p ON p."id"=pl."purchaseRequestId"
  GROUP BY l."demandLineId"
)
SELECT dl."id" AS "demandLineId", dl."demandId", dl."itemId",
  dl."requiredQuantity" AS required,
  COALESCE(c.cancelled,0) AS cancelled,
  GREATEST(COALESCE(a.allocated_gross,0)-COALESCE(rt.returned,0),0) AS allocated,
  COALESCE(rt.returned,0) AS returned,
  GREATEST(COALESCE(r.reserved_gross,0)-COALESCE(a.allocated_gross,0),0) AS reserved,
  GREATEST(dl."requiredQuantity"-COALESCE(c.cancelled,0)-GREATEST(COALESCE(a.allocated_gross,0)-COALESCE(rt.returned,0),0),0) AS remaining,
  COALESCE(p.backlog,0) AS backlog,
  COALESCE(p.pending_approval,0) AS "pendingApproval",
  COALESCE(p.ordered,0) AS ordered,
  COALESCE(p.shipped,0) AS shipped,
  CASE
    WHEN COALESCE(c.cancelled,0) >= dl."requiredQuantity" THEN 'CANCELLED'
    WHEN GREATEST(COALESCE(a.allocated_gross,0)-COALESCE(rt.returned,0),0) >= dl."requiredQuantity"-COALESCE(c.cancelled,0) THEN 'ALLOCATED'
    WHEN GREATEST(COALESCE(a.allocated_gross,0)-COALESCE(rt.returned,0),0) > 0 THEN 'PARTIALLY_ALLOCATED'
    WHEN GREATEST(COALESCE(r.reserved_gross,0)-COALESCE(a.allocated_gross,0),0) >= dl."requiredQuantity"-COALESCE(c.cancelled,0) THEN 'RESERVED'
    ELSE 'PENDING'
  END AS "fulfilmentFacet"
FROM "demand_lines" dl
LEFT JOIN reservations r ON r."demandLineId"=dl."id"
LEFT JOIN allocations a ON a."demandLineId"=dl."id"
LEFT JOIN returns rt ON rt."demandLineId"=dl."id"
LEFT JOIN cancellations c ON c."demandLineId"=dl."id"
LEFT JOIN procurement p ON p."demandLineId"=dl."id";

-- Shared free stock is assigned once in stable demand/row order for truthful deficit visibility.
CREATE VIEW "demand_line_supply" AS
WITH ordered AS (
  SELECT q.*, d."requestedAt", dl."sortOrder",
    GREATEST(q.remaining-q.reserved,0) AS unreserved_demand,
    GREATEST(COALESCE(b."onHand",0)-COALESCE(b.reserved,0),0) AS free_stock,
    COALESCE(SUM(GREATEST(q.remaining-q.reserved,0)) OVER (
      PARTITION BY q."itemId" ORDER BY d."requestedAt",dl."sortOrder",q."demandLineId"
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ),0) AS prior_unreserved
  FROM "demand_line_quantities" q
  JOIN "demand_lines" dl ON dl.id=q."demandLineId"
  JOIN "demands" d ON d.id=q."demandId"
  LEFT JOIN "item_balances" b ON b."itemId"=q."itemId"
  WHERE d.state IN ('SUBMITTED','ACTIVE')
), supplied AS (
  SELECT ordered.*,
    LEAST(unreserved_demand,GREATEST(free_stock-prior_unreserved,0)) AS assignable_free
  FROM ordered
)
SELECT supplied.*,
  GREATEST(unreserved_demand-assignable_free,0) AS "physicalDeficit",
  GREATEST(unreserved_demand-assignable_free-backlog-"pendingApproval"-ordered-shipped,0) AS "unprocuredDeficit",
  CASE
    WHEN remaining = 0 THEN 'COMPLETE'
    WHEN reserved >= remaining THEN 'RESERVED'
    WHEN assignable_free >= unreserved_demand THEN 'AVAILABLE'
    WHEN assignable_free > 0 THEN 'PARTIALLY_AVAILABLE'
    ELSE 'DEFICIT'
  END AS "stockFacet"
FROM supplied;
