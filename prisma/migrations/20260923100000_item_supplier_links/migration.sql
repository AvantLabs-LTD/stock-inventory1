-- Additive catalogue metadata only. Existing Item.link values remain unchanged
-- until a reviewed migration/import deliberately promotes them to supplier links.
CREATE TABLE "item_supplier_links" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "vendorId" TEXT,
    "url" TEXT NOT NULL,
    "supplierPartNumber" TEXT,
    "notes" TEXT,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "item_supplier_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "item_supplier_links_itemId_url_key" ON "item_supplier_links"("itemId", "url");
CREATE INDEX "item_supplier_links_vendorId_idx" ON "item_supplier_links"("vendorId");
CREATE INDEX "item_supplier_links_itemId_isPreferred_idx" ON "item_supplier_links"("itemId", "isPreferred");

ALTER TABLE "item_supplier_links"
  ADD CONSTRAINT "item_supplier_links_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "item_supplier_links"
  ADD CONSTRAINT "item_supplier_links_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
