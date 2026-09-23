-- Stores an immutable per-line product applicability breakdown for compound
-- manufacturing BOMs. The parent BomLine remains the aggregate requirement;
-- this table preserves the source quantities attributed to each product scope.

CREATE TABLE "bom_line_applicability" (
  "id" TEXT NOT NULL,
  "bomLineId" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bom_line_applicability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bom_line_applicability_tag_nonblank" CHECK (NULLIF(BTRIM("tag"), '') IS NOT NULL),
  CONSTRAINT "bom_line_applicability_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "bom_line_applicability_bomLineId_fkey"
    FOREIGN KEY ("bomLineId") REFERENCES "bom_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "bom_line_applicability_bomLineId_tag_key"
  ON "bom_line_applicability"("bomLineId", "tag");
CREATE INDEX "bom_line_applicability_tag_idx"
  ON "bom_line_applicability"("tag");
