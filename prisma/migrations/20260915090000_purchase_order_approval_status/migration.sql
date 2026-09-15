-- Align the persisted workflow value with the canonical purchase lifecycle.
-- PostgreSQL preserves the enum value identity, so existing rows and view
-- dependencies continue to refer to the renamed value without a data rewrite.
ALTER TYPE "PurchaseRequestStatus"
  RENAME VALUE 'PENDING_APPROVAL' TO 'PENDING_ORDER_APPROVAL';
