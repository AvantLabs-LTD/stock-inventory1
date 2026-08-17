-- CreateEnum
CREATE TYPE "ProjectBomUploadStatus" AS ENUM ('PENDING_RECONCILIATION', 'ACCEPTED', 'SUPERSEDED', 'REJECTED');

-- Final role names. Legacy accounts are migrated in place.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
UPDATE "User" SET "role" = CASE
  WHEN "role" IN ('INVENTORY_ADMIN', 'STORE_KEEPER') THEN 'INVENTORY_MANAGER'
  WHEN "role" IN ('DEPARTMENT_USER', 'VIEWER') THEN 'USER'
  ELSE "role"
END;

-- A pending upload is isolated from the currently accepted project tree.
CREATE TABLE "project_bom_uploads" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sheetName" TEXT,
    "status" "ProjectBomUploadStatus" NOT NULL DEFAULT 'PENDING_RECONCILIATION',
    "uploadedById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_bom_uploads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_bom_uploads_acceptance_audit" CHECK (
      "status" NOT IN ('ACCEPTED', 'SUPERSEDED')
      OR ("acceptedById" IS NOT NULL AND "acceptedAt" IS NOT NULL)
    )
);

DROP INDEX "project_components_projectId_sourceLineKey_key";
ALTER TABLE "project_components" ADD COLUMN "bomUploadId" TEXT;

CREATE INDEX "project_bom_uploads_projectId_status_idx" ON "project_bom_uploads"("projectId", "status");
CREATE INDEX "project_bom_uploads_uploadedById_idx" ON "project_bom_uploads"("uploadedById");
CREATE UNIQUE INDEX "project_bom_uploads_one_accepted_per_project"
  ON "project_bom_uploads"("projectId") WHERE "status" = 'ACCEPTED';
CREATE INDEX "project_components_bomUploadId_idx" ON "project_components"("bomUploadId");
CREATE UNIQUE INDEX "project_components_bomUploadId_sourceLineKey_key"
  ON "project_components"("bomUploadId", "sourceLineKey");
CREATE UNIQUE INDEX "project_components_direct_source_line_key"
  ON "project_components"("projectId", "sourceLineKey")
  WHERE "bomUploadId" IS NULL AND "sourceLineKey" IS NOT NULL;

ALTER TABLE "project_components" ADD CONSTRAINT "project_components_bomUploadId_fkey"
  FOREIGN KEY ("bomUploadId") REFERENCES "project_bom_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_bom_uploads" ADD CONSTRAINT "project_bom_uploads_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_bom_uploads" ADD CONSTRAINT "project_bom_uploads_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_bom_uploads" ADD CONSTRAINT "project_bom_uploads_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only accepted uploads (plus direct rows created before staging existed) are
-- visible as live requirements. Pending replacements never affect blockers.
CREATE VIEW "active_project_component_requirements" AS
SELECT requirement.*
FROM "project_component_requirements" requirement
JOIN "project_components" line
  ON line."id" = requirement."projectComponentId"
LEFT JOIN "project_bom_uploads" upload
  ON upload."id" = line."bomUploadId"
WHERE line."bomUploadId" IS NULL OR upload."status" = 'ACCEPTED';
