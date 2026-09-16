import type { UserRole } from "@prisma/client"

export const DEFAULT_GROUP_FOR_ROLE: Record<UserRole, string> = {
  SUPER_ADMIN: "flux_admin",
  INVENTORY_MANAGER: "vault_manager",
  PURCHASE_APPROVER: "vault_purchase_approver",
  USER: "vault_requester",
}

// The legacy role is retained only for old clients and exports. Authorization
// uses group-derived permissions, never this compatibility projection.
export function legacyRoleForGroups(groupIds: string[]): UserRole {
  if (groupIds.includes("flux_admin")) return "SUPER_ADMIN"
  if (groupIds.includes("vault_admin") || groupIds.includes("vault_manager")) return "INVENTORY_MANAGER"
  if (groupIds.includes("vault_purchase_approver")) return "PURCHASE_APPROVER"
  return "USER"
}
