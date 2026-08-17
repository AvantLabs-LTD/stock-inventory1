// ─── ROLE CONSTANTS ────────────────────────────────────────────────────────

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  INVENTORY_MANAGER: 'INVENTORY_MANAGER',
  PURCHASE_APPROVER: 'PURCHASE_APPROVER',
  USER: 'USER',
  // Legacy values remain readable during the migration window.
  INVENTORY_ADMIN: 'INVENTORY_ADMIN',
  STORE_KEEPER: 'STORE_KEEPER',
  DEPARTMENT_USER: 'DEPARTMENT_USER',
  VIEWER: 'VIEWER',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

// ─── ACTION TYPES ──────────────────────────────────────────────────────────

export type Action = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'reject' | 'issue' | 'receive' | 'return' | 'adjust' | 'reserve' | 'release' | 'manage'

// ─── MODULE TYPES ──────────────────────────────────────────────────────────

export type Module =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'suppliers'
  | 'stock'
  | 'departments'
  | 'projects'
  | 'issue_inventory'
  | 'reserved_inventory'
  | 'inventory_requests'
  | 'returns'
  | 'reports'
  | 'audit_logs'
  | 'user_management'
  | 'components'
  | 'project_bom'
  | 'reservations'
  | 'purchase_requests'

// ─── ROLE HIERARCHY (higher number = more permissions) ─────────────────────

const ROLE_LEVEL: Record<string, number> = {
  [ROLES.SUPER_ADMIN]: 100,
  [ROLES.INVENTORY_MANAGER]: 80,
  [ROLES.PURCHASE_APPROVER]: 50,
  [ROLES.USER]: 20,
  [ROLES.INVENTORY_ADMIN]: 80,
  [ROLES.STORE_KEEPER]: 60,
  [ROLES.DEPARTMENT_USER]: 40,
  [ROLES.VIEWER]: 20,
}

// ─── MODULE PERMISSIONS ────────────────────────────────────────────────────
// Each module maps to which roles can perform which actions.
// Format: { action: [allowed roles] }

type ModulePermissions = Record<Action, Role[]>

type PermissionMap = Record<Module, ModulePermissions>

const fullAccess: Role[] = [ROLES.SUPER_ADMIN, ROLES.INVENTORY_MANAGER, ROLES.INVENTORY_ADMIN, ROLES.STORE_KEEPER]
const adminOnly: Role[] = [ROLES.SUPER_ADMIN, ROLES.INVENTORY_MANAGER, ROLES.INVENTORY_ADMIN]
const superAdminOnly: Role[] = [ROLES.SUPER_ADMIN]
const allRoles: Role[] = Object.values(ROLES) as Role[]
const allRolesExceptViewer: Role[] = allRoles.filter((r) => r !== ROLES.VIEWER)

const permissions: PermissionMap = {
  dashboard: {
    view: allRoles,
    create: [],
    edit: [],
    delete: [],
    approve: [],
    reject: [],
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: [],
  },

  products: {
    view: allRoles,
    create: fullAccess,
    edit: fullAccess,
    delete: adminOnly,
    approve: [],
    reject: [],
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  categories: {
    view: allRoles,
    create: adminOnly,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: [],
    reject: [],
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  suppliers: {
    view: allRoles,
    create: adminOnly,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: [],
    reject: [],
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  stock: {
    view: allRoles,
    create: [],
    edit: [],
    delete: [],
    approve: [],
    reject: [],
    issue: [],
    receive: fullAccess,
    return: [],
    adjust: fullAccess,
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  departments: {
    view: allRoles,
    create: adminOnly,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: [],
    reject: [],
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  projects: {
    view: allRoles,
    create: adminOnly,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: [],
    reject: [],
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  issue_inventory: {
    view: allRoles,
    create: fullAccess,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: adminOnly,
    reject: adminOnly,
    issue: fullAccess,
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  reserved_inventory: {
    view: allRoles,
    create: adminOnly,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: [],
    reject: [],
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: adminOnly,
    release: adminOnly,
    manage: adminOnly,
  },

  inventory_requests: {
    view: allRoles,
    create: allRolesExceptViewer,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: adminOnly,
    reject: adminOnly,
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  returns: {
    view: allRoles,
    create: fullAccess,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: [],
    reject: [],
    issue: [],
    receive: fullAccess,
    return: fullAccess,
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  reports: {
    view: allRoles,
    create: adminOnly,
    edit: [],
    delete: [],
    approve: [],
    reject: [],
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  audit_logs: {
    view: adminOnly,
    create: [],
    edit: [],
    delete: superAdminOnly,
    approve: [],
    reject: [],
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  user_management: {
    view: superAdminOnly,
    create: superAdminOnly,
    edit: superAdminOnly,
    delete: superAdminOnly,
    approve: [],
    reject: [],
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: superAdminOnly,
  },

  components: {
    view: allRoles,
    create: adminOnly,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: [],
    reject: [],
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  project_bom: {
    view: allRoles,
    create: adminOnly,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: adminOnly,
    reject: adminOnly,
    issue: [],
    receive: [],
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },

  reservations: {
    view: allRoles,
    create: allRoles,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: adminOnly,
    reject: adminOnly,
    issue: adminOnly,
    receive: [],
    return: adminOnly,
    adjust: [],
    reserve: adminOnly,
    release: adminOnly,
    manage: adminOnly,
  },

  purchase_requests: {
    view: allRoles,
    create: adminOnly,
    edit: adminOnly,
    delete: superAdminOnly,
    approve: [ROLES.SUPER_ADMIN, ROLES.PURCHASE_APPROVER],
    reject: [ROLES.SUPER_ADMIN, ROLES.PURCHASE_APPROVER],
    issue: [],
    receive: adminOnly,
    return: [],
    adjust: [],
    reserve: [],
    release: [],
    manage: adminOnly,
  },
}

// ─── HELPER FUNCTIONS ──────────────────────────────────────────────────────

/**
 * Check if a role has permission for a specific action on a module.
 */
export function hasPermission(role: string, module: Module, action: Action): boolean {
  const modulePerms = permissions[module]
  if (!modulePerms) return false

  const allowedRoles = modulePerms[action]
  if (!allowedRoles) return false

  return allowedRoles.includes(role as Role)
}

/**
 * Check if a role is read-only (VIEWER role).
 */
export function isReadOnly(role: string): boolean {
  return role === ROLES.VIEWER
}

/**
 * Get all permissions for a given role.
 */
export function getPermissionsForRole(role: string): Record<Module, Action[]> {
  const result = {} as Record<Module, Action[]>

  for (const [mod, modulePerms] of Object.entries(permissions)) {
    const allowedActions: Action[] = []
    for (const [action, roles] of Object.entries(modulePerms) as [Action, Role[]][]) {
      if (roles.includes(role as Role)) {
        allowedActions.push(action)
      }
    }
    result[mod as Module] = allowedActions
  }

  return result
}

/**
 * Get the role level for hierarchy comparison.
 */
export function getRoleLevel(role: string): number {
  return ROLE_LEVEL[role] ?? 0
}

/**
 * Check if a role is at least as powerful as the target level.
 */
export function hasMinRole(role: string, minRole: Role): boolean {
  return getRoleLevel(role) >= getRoleLevel(minRole)
}

/**
 * Get all available modules.
 */
export function getModules(): Module[] {
  return Object.keys(permissions) as Module[]
}

/**
 * Get all available actions for a module.
 */
export function getModuleActions(module: Module): Action[] {
  const modulePerms = permissions[module]
  if (!modulePerms) return []
  return (Object.entries(modulePerms) as [Action, Role[]][])
    .filter(([, roles]) => roles.length > 0)
    .map(([action]) => action)
}
