import { create } from 'zustand'

export type AppPage =
  | 'flux'
  | 'cargo'
  | 'cargo-shipments'
  | 'cargo-packages'
  | 'cargo-tracking'
  | 'cargo-finance'
  | 'cargo-management'
  | 'cargo-reports'
  | 'orders'
  | 'people'
  | 'ledger'
  | 'dashboard'
  | 'items'
  | 'demands'
  | 'demand-detail'
  | 'purchasing'
  | 'purchase-detail'
  | 'inventory'
  | 'reference-data'
  | 'users'

export const pagePaths: Record<AppPage, string> = {
  flux: '/', cargo: '/cargo', 'cargo-shipments': '/cargo/shipments',
  'cargo-packages': '/cargo/packages', 'cargo-tracking': '/cargo/tracking',
  'cargo-finance': '/cargo/finance', 'cargo-management': '/cargo/management',
  'cargo-reports': '/cargo/reports', orders: '/orders', people: '/people', ledger: '/ledger',
  dashboard: '/vault', items: '/vault/inventory', demands: '/vault/demands', 'demand-detail': '/vault/demands',
  purchasing: '/vault/legacy-purchasing', 'purchase-detail': '/vault/purchases', inventory: '/vault/movements',
  'reference-data': '/flux/admin/reference-data', users: '/flux/admin/users',
}

export function pageFromPath(pathname: string): AppPage {
  const path = pathname.replace(/\/$/, '') || '/'
  if (/^\/orders\/[^/]+$/.test(path)) return 'orders'
  if (/^\/cargo\/shipments\/[^/]+$/.test(path)) return 'cargo-shipments'
  if (/^\/cargo\/packages\/[^/]+$/.test(path)) return 'cargo-packages'
  if (/^\/vault\/demands\/[^/]+$/.test(path)) return 'demand-detail'
  if (/^\/vault\/purchases\/[^/]+$/.test(path)) return 'purchase-detail'
  return (Object.entries(pagePaths).find(([, value]) => value === path)?.[0] as AppPage | undefined) || 'flux'
}

function entityFromPath(pathname: string) {
  const match = pathname.match(/^\/(?:orders|cargo\/(?:shipments|packages)|vault\/(?:demands|purchases))\/([^/]+)\/?$/)
  return match ? decodeURIComponent(match[1]) : null
}

interface AppState {
  currentPage: AppPage
  selectedEntityId: string | null
  navigate: (page: AppPage, entityId?: string) => void
  goBack: () => void
  syncFromLocation: () => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'flux',
  selectedEntityId: null,
  navigate: (page, entityId) => {
    if (typeof window !== 'undefined') window.history.pushState({}, '', entityId && (page === 'orders' || page === 'cargo-shipments' || page === 'cargo-packages' || page === 'demand-detail' || page === 'purchase-detail') ? `${pagePaths[page]}/${encodeURIComponent(entityId)}` : pagePaths[page])
    set({ currentPage: page, selectedEntityId: entityId ?? null })
  },
  goBack: () => {
    if (typeof window !== 'undefined') window.history.back()
  },
  syncFromLocation: () => {
    if (typeof window !== 'undefined') set({ currentPage: pageFromPath(window.location.pathname), selectedEntityId: entityFromPath(window.location.pathname) })
  },
}))
