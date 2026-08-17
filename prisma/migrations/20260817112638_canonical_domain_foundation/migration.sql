-- CreateEnum
CREATE TYPE "ComponentDiscipline" AS ENUM ('MECHANICAL', 'ELECTRONICS');

-- CreateEnum
CREATE TYPE "CanonicalRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectComponentReconciliationStatus" AS ENUM ('PENDING', 'RECONCILED');

-- CreateEnum
CREATE TYPE "ReservationRequestStatus" AS ENUM ('SUBMITTED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CanonicalReservationStatus" AS ENUM ('PENDING_STOCK', 'PARTIALLY_AVAILABLE', 'AVAILABLE', 'PARTIALLY_ISSUED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AllocationEntryType" AS ENUM ('ALLOCATE', 'RELEASE', 'CONSUME');

-- CreateEnum
CREATE TYPE "InventoryLedgerEntryType" AS ENUM ('OPENING', 'RECEIVE', 'ISSUE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'ASSEMBLY_RECEIVE', 'ASSEMBLY_CONSUME');

-- CreateEnum
CREATE TYPE "PurchaseRequestType" AS ENUM ('FOREIGN_STANDARD', 'FOREIGN_MANUFACTURED', 'LOCAL_STANDARD', 'LOCAL_MANUFACTURED');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('BACKLOG', 'PENDING_ORDER_APPROVAL', 'ORDERED', 'SHIPPED', 'RECEIVED_IN_STORE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('RECEIPT', 'INVOICE', 'QUOTATION', 'SHIPPING_DOCUMENT', 'OTHER');

-- CreateTable
CREATE TABLE "components" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" "ComponentDiscipline" NOT NULL,
    "description" TEXT NOT NULL,
    "function" TEXT,
    "link" TEXT,
    "optionSelection" TEXT,
    "remarks" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "status" "CanonicalRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_components" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "componentId" TEXT,
    "parentProjectComponentId" TEXT,
    "sourceLineKey" TEXT,
    "title" TEXT NOT NULL,
    "discipline" "ComponentDiscipline" NOT NULL,
    "description" TEXT NOT NULL,
    "function" TEXT,
    "link" TEXT,
    "optionSelection" TEXT,
    "remarks" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "reconciliationStatus" "ProjectComponentReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "reconciledById" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_balances" (
    "componentId" TEXT NOT NULL,
    "onHand" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "allocated" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "component_balances_pkey" PRIMARY KEY ("componentId")
);

-- CreateTable
CREATE TABLE "inventory_ledger_entries" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
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
CREATE TABLE "reservation_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "projectId" TEXT,
    "departmentId" TEXT,
    "requestedById" TEXT NOT NULL,
    "status" "ReservationRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_request_lines" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "componentId" TEXT,
    "projectComponentId" TEXT,
    "title" TEXT NOT NULL,
    "discipline" "ComponentDiscipline" NOT NULL,
    "description" TEXT NOT NULL,
    "function" TEXT,
    "link" TEXT,
    "optionSelection" TEXT,
    "remarks" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "reservationNo" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "projectId" TEXT,
    "departmentId" TEXT,
    "convertedById" TEXT NOT NULL,
    "status" "CanonicalReservationStatus" NOT NULL DEFAULT 'PENDING_STOCK',
    "remarks" TEXT,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_lines" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "requestLineId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "projectComponentId" TEXT,
    "requestedQuantity" DECIMAL(18,6) NOT NULL,
    "cancelledQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_allocation_entries" (
    "id" TEXT NOT NULL,
    "reservationLineId" TEXT NOT NULL,
    "type" "AllocationEntryType" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "componentAllocatedAfter" DECIMAL(18,6) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_allocation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_issues" (
    "id" TEXT NOT NULL,
    "issueNo" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
    "remarks" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_issue_lines" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "reservationLineId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_issue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'BACKLOG',
    "provider" TEXT,
    "trackingNumber" TEXT,
    "boxNumber" TEXT,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
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
    "componentId" TEXT NOT NULL,
    "type" "PurchaseRequestType" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_reservation_links" (
    "id" TEXT NOT NULL,
    "purchaseRequestLineId" TEXT NOT NULL,
    "reservationLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_reservation_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "purchaseRequestId" TEXT,
    "provider" TEXT,
    "trackingNumber" TEXT,
    "boxNumber" TEXT,
    "postedById" TEXT NOT NULL,
    "remarks" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purchaseRequestLineId" TEXT,
    "componentId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_returns" (
    "id" TEXT NOT NULL,
    "returnNo" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
    "reason" TEXT,
    "remarks" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_return_lines" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "issueLineId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" TEXT NOT NULL,
    "adjustmentNo" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
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
    "componentId" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "components_code_key" ON "components"("code");

-- CreateIndex
CREATE INDEX "components_title_idx" ON "components"("title");

-- CreateIndex
CREATE INDEX "components_discipline_idx" ON "components"("discipline");

-- CreateIndex
CREATE INDEX "components_status_idx" ON "components"("status");

-- CreateIndex
CREATE INDEX "project_components_projectId_parentProjectComponentId_idx" ON "project_components"("projectId", "parentProjectComponentId");

-- CreateIndex
CREATE INDEX "project_components_componentId_idx" ON "project_components"("componentId");

-- CreateIndex
CREATE INDEX "project_components_reconciliationStatus_idx" ON "project_components"("reconciliationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "project_components_projectId_sourceLineKey_key" ON "project_components"("projectId", "sourceLineKey");

-- CreateIndex
CREATE INDEX "inventory_ledger_entries_componentId_occurredAt_idx" ON "inventory_ledger_entries"("componentId", "occurredAt");

-- CreateIndex
CREATE INDEX "inventory_ledger_entries_sourceType_sourceId_idx" ON "inventory_ledger_entries"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_ledger_entries_sourceType_sourceLineId_key" ON "inventory_ledger_entries"("sourceType", "sourceLineId");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_requests_requestNo_key" ON "reservation_requests"("requestNo");

-- CreateIndex
CREATE INDEX "reservation_requests_projectId_idx" ON "reservation_requests"("projectId");

-- CreateIndex
CREATE INDEX "reservation_requests_departmentId_idx" ON "reservation_requests"("departmentId");

-- CreateIndex
CREATE INDEX "reservation_requests_requestedById_idx" ON "reservation_requests"("requestedById");

-- CreateIndex
CREATE INDEX "reservation_requests_status_idx" ON "reservation_requests"("status");

-- CreateIndex
CREATE INDEX "reservation_request_lines_requestId_idx" ON "reservation_request_lines"("requestId");

-- CreateIndex
CREATE INDEX "reservation_request_lines_componentId_idx" ON "reservation_request_lines"("componentId");

-- CreateIndex
CREATE INDEX "reservation_request_lines_projectComponentId_idx" ON "reservation_request_lines"("projectComponentId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_reservationNo_key" ON "reservations"("reservationNo");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_requestId_key" ON "reservations"("requestId");

-- CreateIndex
CREATE INDEX "reservations_projectId_idx" ON "reservations"("projectId");

-- CreateIndex
CREATE INDEX "reservations_departmentId_idx" ON "reservations"("departmentId");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_lines_requestLineId_key" ON "reservation_lines"("requestLineId");

-- CreateIndex
CREATE INDEX "reservation_lines_reservationId_idx" ON "reservation_lines"("reservationId");

-- CreateIndex
CREATE INDEX "reservation_lines_componentId_idx" ON "reservation_lines"("componentId");

-- CreateIndex
CREATE INDEX "reservation_lines_projectComponentId_idx" ON "reservation_lines"("projectComponentId");

-- CreateIndex
CREATE INDEX "inventory_allocation_entries_reservationLineId_createdAt_idx" ON "inventory_allocation_entries"("reservationLineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_allocation_entries_sourceType_sourceId_key" ON "inventory_allocation_entries"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_issues_issueNo_key" ON "stock_issues"("issueNo");

-- CreateIndex
CREATE INDEX "stock_issues_reservationId_idx" ON "stock_issues"("reservationId");

-- CreateIndex
CREATE INDEX "stock_issues_postedAt_idx" ON "stock_issues"("postedAt");

-- CreateIndex
CREATE INDEX "stock_issue_lines_issueId_idx" ON "stock_issue_lines"("issueId");

-- CreateIndex
CREATE INDEX "stock_issue_lines_reservationLineId_idx" ON "stock_issue_lines"("reservationLineId");

-- CreateIndex
CREATE INDEX "stock_issue_lines_componentId_idx" ON "stock_issue_lines"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_requestNo_key" ON "purchase_requests"("requestNo");

-- CreateIndex
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");

-- CreateIndex
CREATE INDEX "purchase_requests_createdById_idx" ON "purchase_requests"("createdById");

-- CreateIndex
CREATE INDEX "purchase_requests_approvedById_idx" ON "purchase_requests"("approvedById");

-- CreateIndex
CREATE INDEX "purchase_request_lines_purchaseRequestId_idx" ON "purchase_request_lines"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "purchase_request_lines_componentId_idx" ON "purchase_request_lines"("componentId");

-- CreateIndex
CREATE INDEX "purchase_request_lines_type_idx" ON "purchase_request_lines"("type");

-- CreateIndex
CREATE INDEX "purchase_reservation_links_reservationLineId_idx" ON "purchase_reservation_links"("reservationLineId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_reservation_links_purchaseRequestLineId_reservatio_key" ON "purchase_reservation_links"("purchaseRequestLineId", "reservationLineId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_receiptNo_key" ON "goods_receipts"("receiptNo");

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseRequestId_idx" ON "goods_receipts"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "goods_receipts_postedAt_idx" ON "goods_receipts"("postedAt");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_receiptId_idx" ON "goods_receipt_lines"("receiptId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_purchaseRequestLineId_idx" ON "goods_receipt_lines"("purchaseRequestLineId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_componentId_idx" ON "goods_receipt_lines"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_returns_returnNo_key" ON "stock_returns"("returnNo");

-- CreateIndex
CREATE INDEX "stock_returns_postedAt_idx" ON "stock_returns"("postedAt");

-- CreateIndex
CREATE INDEX "stock_return_lines_returnId_idx" ON "stock_return_lines"("returnId");

-- CreateIndex
CREATE INDEX "stock_return_lines_issueLineId_idx" ON "stock_return_lines"("issueLineId");

-- CreateIndex
CREATE INDEX "stock_return_lines_componentId_idx" ON "stock_return_lines"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustments_adjustmentNo_key" ON "inventory_adjustments"("adjustmentNo");

-- CreateIndex
CREATE INDEX "inventory_adjustments_postedAt_idx" ON "inventory_adjustments"("postedAt");

-- CreateIndex
CREATE INDEX "inventory_adjustment_lines_adjustmentId_idx" ON "inventory_adjustment_lines"("adjustmentId");

-- CreateIndex
CREATE INDEX "inventory_adjustment_lines_componentId_idx" ON "inventory_adjustment_lines"("componentId");

-- CreateIndex
CREATE INDEX "attachments_purchaseRequestId_idx" ON "attachments"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "attachments_goodsReceiptId_idx" ON "attachments"("goodsReceiptId");

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_components" ADD CONSTRAINT "project_components_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_components" ADD CONSTRAINT "project_components_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_components" ADD CONSTRAINT "project_components_parentProjectComponentId_fkey" FOREIGN KEY ("parentProjectComponentId") REFERENCES "project_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_components" ADD CONSTRAINT "project_components_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_balances" ADD CONSTRAINT "component_balances_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_request_lines" ADD CONSTRAINT "reservation_request_lines_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "reservation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_request_lines" ADD CONSTRAINT "reservation_request_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_request_lines" ADD CONSTRAINT "reservation_request_lines_projectComponentId_fkey" FOREIGN KEY ("projectComponentId") REFERENCES "project_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "reservation_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_convertedById_fkey" FOREIGN KEY ("convertedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_requestLineId_fkey" FOREIGN KEY ("requestLineId") REFERENCES "reservation_request_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_projectComponentId_fkey" FOREIGN KEY ("projectComponentId") REFERENCES "project_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocation_entries" ADD CONSTRAINT "inventory_allocation_entries_reservationLineId_fkey" FOREIGN KEY ("reservationLineId") REFERENCES "reservation_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocation_entries" ADD CONSTRAINT "inventory_allocation_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issues" ADD CONSTRAINT "stock_issues_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issues" ADD CONSTRAINT "stock_issues_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issue_lines" ADD CONSTRAINT "stock_issue_lines_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "stock_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issue_lines" ADD CONSTRAINT "stock_issue_lines_reservationLineId_fkey" FOREIGN KEY ("reservationLineId") REFERENCES "reservation_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issue_lines" ADD CONSTRAINT "stock_issue_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_reservation_links" ADD CONSTRAINT "purchase_reservation_links_purchaseRequestLineId_fkey" FOREIGN KEY ("purchaseRequestLineId") REFERENCES "purchase_request_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_reservation_links" ADD CONSTRAINT "purchase_reservation_links_reservationLineId_fkey" FOREIGN KEY ("reservationLineId") REFERENCES "reservation_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchaseRequestLineId_fkey" FOREIGN KEY ("purchaseRequestLineId") REFERENCES "purchase_request_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_returns" ADD CONSTRAINT "stock_returns_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_return_lines" ADD CONSTRAINT "stock_return_lines_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "stock_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_return_lines" ADD CONSTRAINT "stock_return_lines_issueLineId_fkey" FOREIGN KEY ("issueLineId") REFERENCES "stock_issue_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_return_lines" ADD CONSTRAINT "stock_return_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_lines" ADD CONSTRAINT "inventory_adjustment_lines_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "inventory_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_lines" ADD CONSTRAINT "inventory_adjustment_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Canonical domain invariants. Prisma cannot express these cross-field rules.
ALTER TABLE "components"
  ADD CONSTRAINT "components_code_not_blank" CHECK (btrim("code") <> ''),
  ADD CONSTRAINT "components_title_not_blank" CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "components_description_not_blank" CHECK (btrim("description") <> '');

ALTER TABLE "project_components"
  ADD CONSTRAINT "project_components_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "project_components_not_own_parent" CHECK ("parentProjectComponentId" IS NULL OR "parentProjectComponentId" <> "id"),
  ADD CONSTRAINT "project_components_reconciliation_complete" CHECK (
    "reconciliationStatus" <> 'RECONCILED'
    OR ("componentId" IS NOT NULL AND "reconciledById" IS NOT NULL AND "reconciledAt" IS NOT NULL)
  );

ALTER TABLE "component_balances"
  ADD CONSTRAINT "component_balances_on_hand_nonnegative" CHECK ("onHand" >= 0),
  ADD CONSTRAINT "component_balances_allocated_nonnegative" CHECK ("allocated" >= 0),
  ADD CONSTRAINT "component_balances_allocation_within_stock" CHECK ("allocated" <= "onHand");

ALTER TABLE "inventory_ledger_entries"
  ADD CONSTRAINT "inventory_ledger_quantity_direction" CHECK (
    ("type" IN ('OPENING', 'RECEIVE', 'RETURN', 'ADJUSTMENT_IN', 'ASSEMBLY_RECEIVE') AND "quantity" > 0)
    OR ("type" IN ('ISSUE', 'ADJUSTMENT_OUT', 'ASSEMBLY_CONSUME') AND "quantity" < 0)
  ),
  ADD CONSTRAINT "inventory_ledger_on_hand_nonnegative" CHECK ("onHandAfter" >= 0);

ALTER TABLE "reservation_requests"
  ADD CONSTRAINT "reservation_requests_one_destination" CHECK (
    ("projectId" IS NOT NULL AND "departmentId" IS NULL)
    OR ("projectId" IS NULL AND "departmentId" IS NOT NULL)
  );

ALTER TABLE "reservation_request_lines"
  ADD CONSTRAINT "reservation_request_lines_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_one_destination" CHECK (
    ("projectId" IS NOT NULL AND "departmentId" IS NULL)
    OR ("projectId" IS NULL AND "departmentId" IS NOT NULL)
  );

ALTER TABLE "reservation_lines"
  ADD CONSTRAINT "reservation_lines_requested_positive" CHECK ("requestedQuantity" > 0),
  ADD CONSTRAINT "reservation_lines_cancelled_valid" CHECK (
    "cancelledQuantity" >= 0 AND "cancelledQuantity" <= "requestedQuantity"
  );

ALTER TABLE "inventory_allocation_entries"
  ADD CONSTRAINT "inventory_allocation_quantity_direction" CHECK (
    ("type" = 'ALLOCATE' AND "quantity" > 0)
    OR ("type" IN ('RELEASE', 'CONSUME') AND "quantity" < 0)
  ),
  ADD CONSTRAINT "inventory_allocation_after_nonnegative" CHECK ("componentAllocatedAfter" >= 0);

ALTER TABLE "stock_issue_lines"
  ADD CONSTRAINT "stock_issue_lines_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "purchase_request_lines"
  ADD CONSTRAINT "purchase_request_lines_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "purchase_reservation_links"
  ADD CONSTRAINT "purchase_reservation_links_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "goods_receipt_lines"
  ADD CONSTRAINT "goods_receipt_lines_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "goods_receipt_lines_unit_cost_nonnegative" CHECK ("unitCost" IS NULL OR "unitCost" >= 0);

ALTER TABLE "stock_return_lines"
  ADD CONSTRAINT "stock_return_lines_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "inventory_adjustment_lines"
  ADD CONSTRAINT "inventory_adjustment_lines_quantity_nonzero" CHECK ("quantity" <> 0);

ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_exactly_one_owner" CHECK (
    ("purchaseRequestId" IS NOT NULL AND "goodsReceiptId" IS NULL)
    OR ("purchaseRequestId" IS NULL AND "goodsReceiptId" IS NOT NULL)
  ),
  ADD CONSTRAINT "attachments_size_limit" CHECK (
    "sizeBytes" >= 0
    AND "sizeBytes" <= 5242880
    AND octet_length("data") = "sizeBytes"
  );

-- A project component can only depend on another association in the same
-- project, and dependency cycles are rejected at the database boundary.
CREATE FUNCTION "validate_project_component_parent"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_project_id TEXT;
  creates_cycle BOOLEAN;
BEGIN
  IF NEW."parentProjectComponentId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "projectId"
    INTO parent_project_id
    FROM "project_components"
   WHERE "id" = NEW."parentProjectComponentId";

  IF parent_project_id IS NULL OR parent_project_id <> NEW."projectId" THEN
    RAISE EXCEPTION 'A project component parent must belong to the same project';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT "id", "parentProjectComponentId"
      FROM "project_components"
     WHERE "id" = NEW."parentProjectComponentId"
    UNION ALL
    SELECT parent."id", parent."parentProjectComponentId"
      FROM "project_components" parent
      JOIN ancestors child ON parent."id" = child."parentProjectComponentId"
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE "id" = NEW."id")
    INTO creates_cycle;

  IF creates_cycle THEN
    RAISE EXCEPTION 'Project component dependencies cannot contain a cycle';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_components_validate_parent"
BEFORE INSERT OR UPDATE OF "projectId", "parentProjectComponentId"
ON "project_components"
FOR EACH ROW
EXECUTE FUNCTION "validate_project_component_parent"();

-- Requirements are derived rather than maintained. Allocation consumption is
-- offset by issued quantity, so a partial issue continues to satisfy demand.
CREATE VIEW "project_component_requirements" AS
WITH RECURSIVE
allocation_totals AS (
  SELECT
    rl."projectComponentId",
    GREATEST(COALESCE(SUM(entry."quantity"), 0), 0)::DECIMAL(18, 6) AS "allocatedQuantity"
  FROM "reservation_lines" rl
  LEFT JOIN "inventory_allocation_entries" entry
    ON entry."reservationLineId" = rl."id"
  WHERE rl."projectComponentId" IS NOT NULL
  GROUP BY rl."projectComponentId"
),
issue_totals AS (
  SELECT
    rl."projectComponentId",
    COALESCE(SUM(line."quantity"), 0)::DECIMAL(18, 6) AS "issuedQuantity"
  FROM "reservation_lines" rl
  LEFT JOIN "stock_issue_lines" line
    ON line."reservationLineId" = rl."id"
  WHERE rl."projectComponentId" IS NOT NULL
  GROUP BY rl."projectComponentId"
),
requirements AS (
  SELECT
    pc."id" AS "projectComponentId",
    pc."projectId",
    pc."componentId",
    pc."parentProjectComponentId",
    0 AS "depth",
    ARRAY[pc."id"]::TEXT[] AS "dependencyPath",
    pc."quantity"::DECIMAL(18, 6) AS "grossRequired",
    COALESCE(a."allocatedQuantity", 0)::DECIMAL(18, 6) AS "allocatedQuantity",
    COALESCE(i."issuedQuantity", 0)::DECIMAL(18, 6) AS "issuedQuantity",
    LEAST(
      pc."quantity",
      COALESCE(a."allocatedQuantity", 0) + COALESCE(i."issuedQuantity", 0)
    )::DECIMAL(18, 6) AS "coveredQuantity",
    GREATEST(
      pc."quantity" - COALESCE(a."allocatedQuantity", 0) - COALESCE(i."issuedQuantity", 0),
      0
    )::DECIMAL(18, 6) AS "uncoveredQuantity"
  FROM "project_components" pc
  LEFT JOIN allocation_totals a ON a."projectComponentId" = pc."id"
  LEFT JOIN issue_totals i ON i."projectComponentId" = pc."id"
  WHERE pc."parentProjectComponentId" IS NULL

  UNION ALL

  SELECT
    child."id" AS "projectComponentId",
    child."projectId",
    child."componentId",
    child."parentProjectComponentId",
    parent."depth" + 1 AS "depth",
    parent."dependencyPath" || child."id" AS "dependencyPath",
    (parent."uncoveredQuantity" * child."quantity")::DECIMAL(18, 6) AS "grossRequired",
    COALESCE(a."allocatedQuantity", 0)::DECIMAL(18, 6) AS "allocatedQuantity",
    COALESCE(i."issuedQuantity", 0)::DECIMAL(18, 6) AS "issuedQuantity",
    LEAST(
      parent."uncoveredQuantity" * child."quantity",
      COALESCE(a."allocatedQuantity", 0) + COALESCE(i."issuedQuantity", 0)
    )::DECIMAL(18, 6) AS "coveredQuantity",
    GREATEST(
      parent."uncoveredQuantity" * child."quantity"
        - COALESCE(a."allocatedQuantity", 0)
        - COALESCE(i."issuedQuantity", 0),
      0
    )::DECIMAL(18, 6) AS "uncoveredQuantity"
  FROM "project_components" child
  JOIN requirements parent
    ON parent."projectComponentId" = child."parentProjectComponentId"
  LEFT JOIN allocation_totals a ON a."projectComponentId" = child."id"
  LEFT JOIN issue_totals i ON i."projectComponentId" = child."id"
  WHERE NOT child."id" = ANY(parent."dependencyPath")
)
SELECT
  "projectComponentId",
  "projectId",
  "componentId",
  "parentProjectComponentId",
  "depth",
  "grossRequired",
  "allocatedQuantity",
  "issuedQuantity",
  "coveredQuantity",
  "uncoveredQuantity",
  ("uncoveredQuantity" > 0) AS "isBlocker"
FROM requirements;
