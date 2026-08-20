-- Canonical PostgreSQL baseline for the zero-data development system.
-- Legacy product, counter, reservation, and stock schemas are intentionally absent.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'INVENTORY_MANAGER', 'PURCHASE_APPROVER', 'USER');

-- CreateEnum
CREATE TYPE "ComponentDiscipline" AS ENUM ('MECHANICAL', 'ELECTRONICS');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectComponentReconciliationStatus" AS ENUM ('PENDING', 'RECONCILED');

-- CreateEnum
CREATE TYPE "ProjectBomUploadStatus" AS ENUM ('PENDING_RECONCILIATION', 'ACCEPTED', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReservationRequestStatus" AS ENUM ('SUBMITTED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AllocationEntryType" AS ENUM ('ALLOCATE', 'RELEASE', 'CONSUME');

-- CreateEnum
CREATE TYPE "InventoryLedgerEntryType" AS ENUM ('OPENING', 'RECEIVE', 'ISSUE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'ASSEMBLY_RECEIVE', 'ASSEMBLY_CONSUME');

-- CreateEnum
CREATE TYPE "PurchaseRequestType" AS ENUM ('FOREIGN_STANDARD', 'FOREIGN_MANUFACTURED', 'LOCAL_STANDARD', 'LOCAL_MANUFACTURED');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('BACKLOG', 'PENDING_ORDER_APPROVAL', 'ORDERED', 'SHIPPED', 'RECEIVED_IN_STORE');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('RECEIPT', 'INVOICE', 'QUOTATION', 'SHIPPING_DOCUMENT', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT,
    "avatar" TEXT,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "headName" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

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
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_components" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bomUploadId" TEXT,
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
CREATE TABLE "project_bom_uploads" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sheetName" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "status" "ProjectBomUploadStatus" NOT NULL DEFAULT 'PENDING_RECONCILIATION',
    "uploadedById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_bom_uploads_pkey" PRIMARY KEY ("id")
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
    "bomVersionId" TEXT,
    "setCount" INTEGER,
    "convertedById" TEXT NOT NULL,
    "cancelledById" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_lines" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "requestLineId" TEXT,
    "componentId" TEXT NOT NULL,
    "projectComponentId" TEXT,
    "requestedQuantity" DECIMAL(18,6),
    "cancelledQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_cancellation_entries" (
    "id" TEXT NOT NULL,
    "reservationLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_cancellation_entries_pkey" PRIMARY KEY ("id")
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
    "idempotencyKey" TEXT,
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
    "idempotencyKey" TEXT,
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
    "idempotencyKey" TEXT,
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
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_name_idx" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_departmentId_idx" ON "Project"("departmentId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

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
CREATE INDEX "project_components_bomUploadId_idx" ON "project_components"("bomUploadId");

-- CreateIndex
CREATE INDEX "project_components_componentId_idx" ON "project_components"("componentId");

-- CreateIndex
CREATE INDEX "project_components_reconciliationStatus_idx" ON "project_components"("reconciliationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "project_components_bomUploadId_sourceLineKey_key" ON "project_components"("bomUploadId", "sourceLineKey");

-- CreateIndex
CREATE INDEX "project_bom_uploads_projectId_status_idx" ON "project_bom_uploads"("projectId", "status");

-- CreateIndex
CREATE INDEX "project_bom_uploads_uploadedById_idx" ON "project_bom_uploads"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "project_bom_uploads_projectId_versionNumber_key" ON "project_bom_uploads"("projectId", "versionNumber");

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
CREATE INDEX "reservations_bomVersionId_idx" ON "reservations"("bomVersionId");

-- CreateIndex
CREATE INDEX "reservations_cancelledById_idx" ON "reservations"("cancelledById");

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
CREATE UNIQUE INDEX "reservation_cancellation_entries_sourceId_key" ON "reservation_cancellation_entries"("sourceId");

-- CreateIndex
CREATE INDEX "reservation_cancellation_entries_reservationLineId_createdA_idx" ON "reservation_cancellation_entries"("reservationLineId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_allocation_entries_reservationLineId_createdAt_idx" ON "inventory_allocation_entries"("reservationLineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_allocation_entries_sourceType_sourceId_key" ON "inventory_allocation_entries"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_issues_issueNo_key" ON "stock_issues"("issueNo");

-- CreateIndex
CREATE UNIQUE INDEX "stock_issues_idempotencyKey_key" ON "stock_issues"("idempotencyKey");

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
CREATE UNIQUE INDEX "purchase_requests_idempotencyKey_key" ON "purchase_requests"("idempotencyKey");

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
CREATE UNIQUE INDEX "goods_receipts_idempotencyKey_key" ON "goods_receipts"("idempotencyKey");

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
CREATE UNIQUE INDEX "stock_returns_idempotencyKey_key" ON "stock_returns"("idempotencyKey");

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
CREATE UNIQUE INDEX "inventory_adjustments_idempotencyKey_key" ON "inventory_adjustments"("idempotencyKey");

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
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_components" ADD CONSTRAINT "project_components_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_components" ADD CONSTRAINT "project_components_bomUploadId_fkey" FOREIGN KEY ("bomUploadId") REFERENCES "project_bom_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_components" ADD CONSTRAINT "project_components_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_components" ADD CONSTRAINT "project_components_parentProjectComponentId_fkey" FOREIGN KEY ("parentProjectComponentId") REFERENCES "project_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_components" ADD CONSTRAINT "project_components_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_bom_uploads" ADD CONSTRAINT "project_bom_uploads_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_bom_uploads" ADD CONSTRAINT "project_bom_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_bom_uploads" ADD CONSTRAINT "project_bom_uploads_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "project_bom_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_convertedById_fkey" FOREIGN KEY ("convertedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_requestLineId_fkey" FOREIGN KEY ("requestLineId") REFERENCES "reservation_request_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_projectComponentId_fkey" FOREIGN KEY ("projectComponentId") REFERENCES "project_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_cancellation_entries" ADD CONSTRAINT "reservation_cancellation_entries_reservationLineId_fkey" FOREIGN KEY ("reservationLineId") REFERENCES "reservation_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_cancellation_entries" ADD CONSTRAINT "reservation_cancellation_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- Audit history is retained as part of the core product, not an inventory counter.
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
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_date_idx" ON "audit_logs"("date");
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints that Prisma cannot express.
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_destination"
  CHECK ((("projectId" IS NOT NULL)::INTEGER + ("departmentId" IS NOT NULL)::INTEGER) = 1);
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_destination"
  CHECK ((("projectId" IS NOT NULL)::INTEGER + ("departmentId" IS NOT NULL)::INTEGER) = 1);
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cycle_inputs" CHECK (
  ("projectId" IS NULL AND "bomVersionId" IS NULL AND "setCount" IS NULL)
  OR ("projectId" IS NOT NULL AND "bomVersionId" IS NOT NULL AND "setCount" > 0)
);
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cancellation_audit" CHECK (
  ("status" <> 'CANCELLED' AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
  OR ("status" = 'CANCELLED' AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND btrim("cancellationReason") <> '')
);
ALTER TABLE "project_components" ADD CONSTRAINT "project_components_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "reservation_request_lines" ADD CONSTRAINT "reservation_request_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_quantity_source" CHECK (
  ("projectComponentId" IS NOT NULL AND "requestedQuantity" IS NULL)
  OR ("projectComponentId" IS NULL AND "requestedQuantity" > 0)
);
ALTER TABLE "reservation_cancellation_entries" ADD CONSTRAINT "reservation_cancellation_entries_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "reservation_cancellation_entries" ADD CONSTRAINT "reservation_cancellation_entries_reason_not_blank" CHECK (btrim("reason") <> '');
ALTER TABLE "inventory_allocation_entries" ADD CONSTRAINT "inventory_allocation_entries_nonzero" CHECK ("quantity" <> 0);
ALTER TABLE "stock_issue_lines" ADD CONSTRAINT "stock_issue_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "purchase_reservation_links" ADD CONSTRAINT "purchase_reservation_links_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "stock_return_lines" ADD CONSTRAINT "stock_return_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "inventory_adjustment_lines" ADD CONSTRAINT "inventory_adjustment_lines_nonzero" CHECK ("quantity" <> 0);

-- Cycle requirements are projections of BOM inputs and immutable journals.
CREATE VIEW "reservation_line_requirements" AS
WITH RECURSIVE
allocation_totals AS (
  SELECT "reservationLineId", COALESCE(SUM("quantity"), 0)::DECIMAL(18, 6) AS quantity
  FROM "inventory_allocation_entries" GROUP BY "reservationLineId"
),
issue_totals AS (
  SELECT "reservationLineId", COALESCE(SUM("quantity"), 0)::DECIMAL(18, 6) AS quantity
  FROM "stock_issue_lines" GROUP BY "reservationLineId"
),
return_totals AS (
  SELECT issue."reservationLineId", COALESCE(SUM(return_line."quantity"), 0)::DECIMAL(18, 6) AS quantity
  FROM "stock_return_lines" return_line
  JOIN "stock_issue_lines" issue ON issue."id" = return_line."issueLineId"
  GROUP BY issue."reservationLineId"
),
cancellation_totals AS (
  SELECT "reservationLineId", COALESCE(SUM("quantity"), 0)::DECIMAL(18, 6) AS quantity
  FROM "reservation_cancellation_entries" GROUP BY "reservationLineId"
),
cycle_requirements AS (
  SELECT
    line."id" AS "reservationLineId", line."reservationId", line."componentId", line."projectComponentId",
    project_line."parentProjectComponentId", 0 AS depth, ARRAY[project_line."id"]::TEXT[] AS path,
    (project_line."quantity" * reservation."setCount")::DECIMAL(18, 6) AS "requiredQuantity",
    COALESCE(cancelled.quantity, 0)::DECIMAL(18, 6) AS "cancelledQuantity",
    GREATEST(COALESCE(allocation.quantity, 0), 0)::DECIMAL(18, 6) AS "allocatedQuantity",
    GREATEST(COALESCE(issue.quantity, 0) - COALESCE(returned.quantity, 0), 0)::DECIMAL(18, 6) AS "netIssuedQuantity",
    GREATEST(
      project_line."quantity" * reservation."setCount" - COALESCE(cancelled.quantity, 0)
      - GREATEST(COALESCE(allocation.quantity, 0), 0)
      - GREATEST(COALESCE(issue.quantity, 0) - COALESCE(returned.quantity, 0), 0), 0
    )::DECIMAL(18, 6) AS "manufacturingUncoveredQuantity"
  FROM "reservations" reservation
  JOIN "reservation_lines" line ON line."reservationId" = reservation."id"
  JOIN "project_components" project_line ON project_line."id" = line."projectComponentId"
  LEFT JOIN allocation_totals allocation ON allocation."reservationLineId" = line."id"
  LEFT JOIN issue_totals issue ON issue."reservationLineId" = line."id"
  LEFT JOIN return_totals returned ON returned."reservationLineId" = line."id"
  LEFT JOIN cancellation_totals cancelled ON cancelled."reservationLineId" = line."id"
  WHERE reservation."bomVersionId" IS NOT NULL AND project_line."parentProjectComponentId" IS NULL

  UNION ALL

  SELECT
    line."id", line."reservationId", line."componentId", line."projectComponentId",
    project_line."parentProjectComponentId", parent.depth + 1, parent.path || project_line."id",
    (parent."manufacturingUncoveredQuantity" * project_line."quantity")::DECIMAL(18, 6),
    COALESCE(cancelled.quantity, 0)::DECIMAL(18, 6),
    GREATEST(COALESCE(allocation.quantity, 0), 0)::DECIMAL(18, 6),
    GREATEST(COALESCE(issue.quantity, 0) - COALESCE(returned.quantity, 0), 0)::DECIMAL(18, 6),
    GREATEST(
      parent."manufacturingUncoveredQuantity" * project_line."quantity" - COALESCE(cancelled.quantity, 0)
      - GREATEST(COALESCE(allocation.quantity, 0), 0)
      - GREATEST(COALESCE(issue.quantity, 0) - COALESCE(returned.quantity, 0), 0), 0
    )::DECIMAL(18, 6)
  FROM cycle_requirements parent
  JOIN "project_components" project_line ON project_line."parentProjectComponentId" = parent."projectComponentId"
  JOIN "reservation_lines" line ON line."reservationId" = parent."reservationId" AND line."projectComponentId" = project_line."id"
  LEFT JOIN allocation_totals allocation ON allocation."reservationLineId" = line."id"
  LEFT JOIN issue_totals issue ON issue."reservationLineId" = line."id"
  LEFT JOIN return_totals returned ON returned."reservationLineId" = line."id"
  LEFT JOIN cancellation_totals cancelled ON cancelled."reservationLineId" = line."id"
  WHERE NOT project_line."id" = ANY(parent.path)
),
direct_requirements AS (
  SELECT
    line."id" AS "reservationLineId", line."reservationId", line."componentId", line."projectComponentId",
    NULL::TEXT AS "parentProjectComponentId", 0 AS depth, ARRAY[line."id"]::TEXT[] AS path,
    line."requestedQuantity"::DECIMAL(18, 6) AS "requiredQuantity",
    COALESCE(cancelled.quantity, 0)::DECIMAL(18, 6) AS "cancelledQuantity",
    GREATEST(COALESCE(allocation.quantity, 0), 0)::DECIMAL(18, 6) AS "allocatedQuantity",
    GREATEST(COALESCE(issue.quantity, 0) - COALESCE(returned.quantity, 0), 0)::DECIMAL(18, 6) AS "netIssuedQuantity",
    GREATEST(
      line."requestedQuantity" - COALESCE(cancelled.quantity, 0)
      - GREATEST(COALESCE(allocation.quantity, 0), 0)
      - GREATEST(COALESCE(issue.quantity, 0) - COALESCE(returned.quantity, 0), 0), 0
    )::DECIMAL(18, 6) AS "manufacturingUncoveredQuantity"
  FROM "reservation_lines" line
  LEFT JOIN allocation_totals allocation ON allocation."reservationLineId" = line."id"
  LEFT JOIN issue_totals issue ON issue."reservationLineId" = line."id"
  LEFT JOIN return_totals returned ON returned."reservationLineId" = line."id"
  LEFT JOIN cancellation_totals cancelled ON cancelled."reservationLineId" = line."id"
  WHERE line."projectComponentId" IS NULL
),
requirements AS (SELECT * FROM cycle_requirements UNION ALL SELECT * FROM direct_requirements)
SELECT requirement.*,
  GREATEST("requiredQuantity" - "cancelledQuantity" - "netIssuedQuantity", 0)::DECIMAL(18, 6) AS "remainingQuantity",
  GREATEST("requiredQuantity" - "cancelledQuantity" - "netIssuedQuantity" - "allocatedQuantity", 0)::DECIMAL(18, 6) AS "unallocatedDemand"
FROM requirements requirement;

-- Stable ordering assigns shared free stock once across all open demand.
CREATE VIEW "reservation_line_supply" AS
WITH purchase_coverage AS (
  SELECT link."reservationLineId",
    COALESCE(SUM(link."quantity") FILTER (WHERE request."status" = 'BACKLOG'), 0)::DECIMAL(18, 6) AS "backlogQuantity",
    COALESCE(SUM(link."quantity") FILTER (WHERE request."status" = 'PENDING_ORDER_APPROVAL'), 0)::DECIMAL(18, 6) AS "pendingApprovalQuantity",
    COALESCE(SUM(link."quantity") FILTER (WHERE request."status" = 'ORDERED'), 0)::DECIMAL(18, 6) AS "orderedQuantity",
    COALESCE(SUM(link."quantity") FILTER (WHERE request."status" = 'SHIPPED'), 0)::DECIMAL(18, 6) AS "shippedQuantity"
  FROM "purchase_reservation_links" link
  JOIN "purchase_request_lines" purchase_line ON purchase_line."id" = link."purchaseRequestLineId"
  JOIN "purchase_requests" request ON request."id" = purchase_line."purchaseRequestId"
  GROUP BY link."reservationLineId"
),
ordered_demand AS (
  SELECT requirement.*, reservation."createdAt" AS "reservationCreatedAt", reservation."reservationNo",
    COALESCE(balance."onHand" - balance."allocated", 0)::DECIMAL(18, 6) AS "componentFreeStock",
    COALESCE(SUM(requirement."unallocatedDemand") OVER (
      PARTITION BY requirement."componentId"
      ORDER BY reservation."createdAt", reservation."reservationNo", requirement."reservationLineId"
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0)::DECIMAL(18, 6) AS "priorUnallocatedDemand"
  FROM "reservation_line_requirements" requirement
  JOIN "reservations" reservation ON reservation."id" = requirement."reservationId"
  LEFT JOIN "component_balances" balance ON balance."componentId" = requirement."componentId"
  WHERE reservation."status" NOT IN ('CLOSED', 'CANCELLED')
),
assigned AS (
  SELECT demand.*,
    LEAST("unallocatedDemand", GREATEST("componentFreeStock" - "priorUnallocatedDemand", 0))::DECIMAL(18, 6) AS "assignableFreeStock"
  FROM ordered_demand demand
)
SELECT assigned.*,
  GREATEST("unallocatedDemand" - "assignableFreeStock", 0)::DECIMAL(18, 6) AS "physicalStockDeficit",
  COALESCE(coverage."backlogQuantity", 0)::DECIMAL(18, 6) AS "backlogQuantity",
  COALESCE(coverage."pendingApprovalQuantity", 0)::DECIMAL(18, 6) AS "pendingApprovalQuantity",
  COALESCE(coverage."orderedQuantity", 0)::DECIMAL(18, 6) AS "orderedQuantity",
  COALESCE(coverage."shippedQuantity", 0)::DECIMAL(18, 6) AS "shippedQuantity",
  GREATEST(
    "unallocatedDemand" - "assignableFreeStock" - COALESCE(coverage."backlogQuantity", 0)
    - COALESCE(coverage."pendingApprovalQuantity", 0) - COALESCE(coverage."orderedQuantity", 0)
    - COALESCE(coverage."shippedQuantity", 0), 0
  )::DECIMAL(18, 6) AS "unprocuredDeficit"
FROM assigned
LEFT JOIN purchase_coverage coverage ON coverage."reservationLineId" = assigned."reservationLineId";
