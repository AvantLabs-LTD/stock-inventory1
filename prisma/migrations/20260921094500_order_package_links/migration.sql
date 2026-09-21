CREATE TABLE "procurement_order_packages" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "remarks" TEXT,
  "linkedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurement_order_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "procurement_order_packages_orderId_packageId_key" ON "procurement_order_packages"("orderId", "packageId");
CREATE INDEX "procurement_order_packages_packageId_idx" ON "procurement_order_packages"("packageId");
CREATE INDEX "procurement_order_packages_orderId_createdAt_idx" ON "procurement_order_packages"("orderId", "createdAt");

ALTER TABLE "procurement_order_packages" ADD CONSTRAINT "procurement_order_packages_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "procurement_order_packages" ADD CONSTRAINT "procurement_order_packages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "cargo_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "procurement_order_packages" ADD CONSTRAINT "procurement_order_packages_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
