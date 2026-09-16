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

test("every Flux and Vault navigation target survives a direct URL", () => {
  for (const [page, path] of Object.entries(pagePaths)) {
    assert.equal(pageFromPath(path), page)
    assert.equal(pageFromPath(`${path}/`), page)
  }
})
