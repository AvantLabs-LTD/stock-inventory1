export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  INVENTORY_MANAGER: 'INVENTORY_MANAGER',
  PURCHASE_APPROVER: 'PURCHASE_APPROVER',
  USER: 'USER',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]
export type Action = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'reject' | 'issue' | 'receive' | 'return' | 'adjust' | 'reserve' | 'release' | 'manage'
export type Module =
  | 'dashboard'
  | 'stock'
  | 'departments'
  | 'projects'
  | 'audit_logs'
  | 'components'
  | 'project_bom'
  | 'reservations'
  | 'returns'
  | 'purchase_requests'

const allRoles: Role[] = Object.values(ROLES)
const managers: Role[] = [ROLES.SUPER_ADMIN, ROLES.INVENTORY_MANAGER]
const superAdmins: Role[] = [ROLES.SUPER_ADMIN]
const purchaseApprovers: Role[] = [ROLES.SUPER_ADMIN, ROLES.PURCHASE_APPROVER]

type ModulePermissions = Record<Action, Role[]>
type PermissionMap = Record<Module, ModulePermissions>

function modulePermissions(overrides: Partial<ModulePermissions>): ModulePermissions {
  return {
    view: [],
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
    ...overrides,
  }
}

const permissions: PermissionMap = {
  dashboard: modulePermissions({ view: allRoles }),
  stock: modulePermissions({ view: allRoles, adjust: managers, manage: managers }),
  departments: modulePermissions({ view: allRoles, create: managers, edit: managers, delete: superAdmins, manage: managers }),
  projects: modulePermissions({ view: allRoles, create: managers, edit: managers, delete: superAdmins, manage: managers }),
  audit_logs: modulePermissions({ view: managers, manage: managers }),
  components: modulePermissions({ view: allRoles, create: managers, edit: managers, delete: managers, manage: managers }),
  project_bom: modulePermissions({ view: allRoles, create: managers, edit: managers, approve: managers, reject: managers, manage: managers }),
  reservations: modulePermissions({
    view: allRoles,
    create: allRoles,
    edit: managers,
    approve: managers,
    issue: managers,
    return: managers,
    reserve: managers,
    release: managers,
    manage: managers,
  }),
  returns: modulePermissions({ view: allRoles, create: managers, return: managers, manage: managers }),
  purchase_requests: modulePermissions({
    view: allRoles,
    create: managers,
    edit: managers,
    approve: purchaseApprovers,
    reject: purchaseApprovers,
    receive: managers,
    manage: managers,
  }),
}

export function hasPermission(role: string, module: Module, action: Action): boolean {
  return permissions[module][action].includes(role as Role)
}

export function isReadOnly(role: string): boolean {
  return role === ROLES.USER || role === ROLES.PURCHASE_APPROVER
}

export function getPermissionsForRole(role: string): Record<Module, Action[]> {
  const result = {} as Record<Module, Action[]>
  for (const [module, modulePermissions] of Object.entries(permissions)) {
    result[module as Module] = (Object.entries(modulePermissions) as [Action, Role[]][])
      .filter(([, roles]) => roles.includes(role as Role))
      .map(([action]) => action)
  }
  return result
}

export function getModules(): Module[] {
  return Object.keys(permissions) as Module[]
}

export function getModuleActions(module: Module): Action[] {
  return (Object.entries(permissions[module]) as [Action, Role[]][])
    .filter(([, roles]) => roles.length > 0)
    .map(([action]) => action)
}
