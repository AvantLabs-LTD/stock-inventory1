-- List pages consistently filter records by status and sort them newest-first.
-- These additive indexes keep those paths indexed as history grows.
CREATE INDEX "demands_requestedById_requestedAt_idx" ON "demands"("requestedById", "requestedAt" DESC);
CREATE INDEX "purchase_requests_status_createdAt_idx" ON "purchase_requests"("status", "createdAt" DESC);
CREATE INDEX "cargo_shipments_status_createdAt_idx" ON "cargo_shipments"("status", "createdAt" DESC);
CREATE INDEX "cargo_packages_status_createdAt_idx" ON "cargo_packages"("status", "createdAt" DESC);
