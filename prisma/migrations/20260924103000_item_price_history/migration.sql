-- Immutable catalogue price evidence. Existing receipt-line unit costs remain
-- historical source facts and are intentionally not rewritten by this
-- additive migration.
CREATE TYPE "ItemPriceSource" AS ENUM ('MANUAL', 'GOODS_RECEIPT', 'QUOTATION', 'SUPPLIER_CATALOGUE');

CREATE TABLE "item_price_records" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "vendorId" TEXT,
  "amount" DECIMAL(18,4) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "source" "ItemPriceSource" NOT NULL DEFAULT 'MANUAL',
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" TEXT,
  "notes" TEXT,
  "recordedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "item_price_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "item_price_records_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "item_price_records_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "item_price_records_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "item_price_records_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "item_price_records_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "item_price_records_itemId_effectiveAt_idx" ON "item_price_records"("itemId", "effectiveAt" DESC);
CREATE INDEX "item_price_records_vendorId_effectiveAt_idx" ON "item_price_records"("vendorId", "effectiveAt" DESC);
