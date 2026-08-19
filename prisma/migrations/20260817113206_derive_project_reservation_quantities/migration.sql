-- AlterTable
ALTER TABLE "reservation_lines" ALTER COLUMN "requestedQuantity" DROP NOT NULL;

ALTER TABLE "reservation_lines"
  ADD CONSTRAINT "reservation_lines_quantity_source" CHECK (
    ("projectComponentId" IS NULL AND "requestedQuantity" IS NOT NULL)
    OR ("projectComponentId" IS NOT NULL AND "requestedQuantity" IS NULL)
  );
