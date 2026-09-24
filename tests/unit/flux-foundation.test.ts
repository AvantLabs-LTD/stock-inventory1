import assert from "node:assert/strict"
import { test } from "node:test"
import { DEFAULT_GROUP_FOR_ROLE, legacyRoleForGroups } from "../../src/lib/access-groups"
import { pageFromPath, pagePaths } from "../../src/stores/app-store"

test("every legacy role maps to a group without losing administrator access", () => {
  assert.equal(DEFAULT_GROUP_FOR_ROLE.SUPER_ADMIN, "flux_admin")
  assert.equal(DEFAULT_GROUP_FOR_ROLE.INVENTORY_MANAGER, "vault_manager")
  assert.equal(DEFAULT_GROUP_FOR_ROLE.PURCHASE_APPROVER, "vault_purchase_approver")
  assert.equal(DEFAULT_GROUP_FOR_ROLE.USER, "vault_requester")
})

test("legacy role is a compatibility projection of group membership", () => {
  assert.equal(legacyRoleForGroups(["viewer", "vault_purchase_approver"]), "PURCHASE_APPROVER")
  assert.equal(legacyRoleForGroups(["vault_admin"]), "INVENTORY_MANAGER")
  assert.equal(legacyRoleForGroups(["viewer"]), "USER")
})

test("every Flux module navigation target survives a direct URL", () => {
  const dynamicPages = new Set(["demand-detail", "purchase-detail", "manufacturing-bom-detail", "manufacturing-route-detail", "manufacturing-project-detail"])
  for (const [page, path] of Object.entries(pagePaths)) {
    if (dynamicPages.has(page)) continue
    assert.equal(pageFromPath(path), page)
    assert.equal(pageFromPath(`${path}/`), page)
  }
})

test("Cargo sections have distinct, shareable routes", () => {
  assert.equal(pagePaths.cargo, "/cargo")
  assert.equal(pagePaths["cargo-shipments"], "/cargo/shipments")
  assert.equal(pagePaths["cargo-packages"], "/cargo/packages")
  assert.equal(pagePaths["cargo-tracking"], "/cargo/tracking")
  assert.equal(pagePaths["cargo-finance"], "/cargo/finance")
  assert.equal(pagePaths["cargo-management"], "/cargo/management")
  assert.equal(pagePaths["cargo-reports"], "/cargo/reports")
  assert.equal(pageFromPath("/cargo/shipments/shipment-123"), "cargo-shipments")
  assert.equal(pageFromPath("/cargo/packages/package-123"), "cargo-packages")
})

test("Manufacturing registers and details use stable shareable routes", () => {
  assert.equal(pagePaths["manufacturing-boms"], "/manufacturing/boms")
  assert.equal(pagePaths["manufacturing-projects"], "/manufacturing/projects")
  assert.equal(pagePaths["manufacturing-planning"], "/manufacturing/planning")
  assert.equal(pageFromPath("/manufacturing/boms/bom-123"), "manufacturing-bom-detail")
  assert.equal(pageFromPath("/manufacturing/routes/route-123"), "manufacturing-route-detail")
  assert.equal(pageFromPath("/manufacturing/projects/project-123"), "manufacturing-project-detail")
})
