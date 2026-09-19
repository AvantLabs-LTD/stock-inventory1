-- Generic Orders foundation. Marketplace exports are import sources, not the
-- canonical model; direct supplier and procurement-agent orders use the same tables.
BEGIN;

CREATE TYPE "ProcurementOrderStatus" AS ENUM ('DRAFT', 'PLACED', 'PAID', 'SUPPLIER_SHIPPED', 'CLOSED', 'CANCELLED');

CREATE TABLE "procurement_orders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "status" "ProcurementOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceStatus" TEXT,
  "vendorId" TEXT,
  "supplierName" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'PKR',
  "paidAmount" DECIMAL(14,4),
  "shippingAmount" DECIMAL(14,4),
  "courierName" TEXT,
  "trackingNumber" TEXT,
  "notes" TEXT,
  "sourceFileName" TEXT,
  "sourcePayload" JSONB,
  "createdById" TEXT NOT NULL,
  "statusRecord" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "procurement_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "procurement_orders_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "procurement_orders_amount_check" CHECK (("paidAmount" IS NULL OR "paidAmount" >= 0) AND ("shippingAmount" IS NULL OR "shippingAmount" >= 0)),
  CONSTRAINT "procurement_orders_source_orderNo_key" UNIQUE ("source", "orderNo")
);
CREATE INDEX "procurement_orders_status_submittedAt_idx" ON "procurement_orders"("status", "submittedAt");
CREATE INDEX "procurement_orders_vendorId_idx" ON "procurement_orders"("vendorId");
CREATE INDEX "procurement_orders_trackingNumber_idx" ON "procurement_orders"("trackingNumber");

CREATE TABLE "procurement_order_lines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "itemId" TEXT,
  "description" TEXT NOT NULL,
  "productUrl" TEXT,
  "variant" TEXT,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unitPrice" DECIMAL(14,4),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "procurement_order_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "procurement_order_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "procurement_order_lines_unitPrice_check" CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0),
  CONSTRAINT "procurement_order_lines_orderId_lineNo_key" UNIQUE ("orderId", "lineNo")
);
CREATE INDEX "procurement_order_lines_itemId_idx" ON "procurement_order_lines"("itemId");

INSERT INTO "permissions" ("key", "module", "description") VALUES
  ('orders.view', 'orders', 'View supplier orders and their line items'),
  ('orders.manage', 'orders', 'Create, edit, archive, and update supplier orders'),
  ('orders.import', 'orders', 'Import marketplace and supplier order exports');

INSERT INTO "access_groups" ("id", "name", "description", "isSystem") VALUES
  ('orders_admin', 'Orders Admin', 'All Orders actions, including imports', true),
  ('orders_operator', 'Orders Operator', 'Create and manage Orders without imports', true);

INSERT INTO "access_group_permissions" ("groupId", "permissionKey")
SELECT 'flux_admin', "key" FROM "permissions" WHERE "module" = 'orders';
INSERT INTO "access_group_permissions" ("groupId", "permissionKey") VALUES
  ('orders_admin', 'orders.view'), ('orders_admin', 'orders.manage'), ('orders_admin', 'orders.import'),
  ('orders_operator', 'orders.view'), ('orders_operator', 'orders.manage'),
  ('viewer', 'orders.view');

COMMIT;
