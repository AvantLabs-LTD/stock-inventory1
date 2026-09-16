import { create } from 'zustand'

export type AppPage =
  | 'flux'
  | 'cargo'
  | 'orders'
  | 'people'
  | 'ledger'
  | 'dashboard'
  | 'items'
  | 'demands'
  | 'purchasing'
  | 'inventory'
  | 'reference-data'
  | 'users'

export const pagePaths: Record<AppPage, string> = {
  flux: '/', cargo: '/cargo', orders: '/orders', people: '/people', ledger: '/ledger',
  dashboard: '/vault', items: '/vault/inventory', demands: '/vault/demands',
  purchasing: '/vault/legacy-purchasing', inventory: '/vault/movements',
  'reference-data': '/flux/admin/reference-data', users: '/flux/admin/users',
}

export function pageFromPath(pathname: string): AppPage {
  const path = pathname.replace(/\/$/, '') || '/'
  return (Object.entries(pagePaths).find(([, value]) => value === path)?.[0] as AppPage | undefined) || 'flux'
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
    if (typeof window !== 'undefined') window.history.pushState({}, '', pagePaths[page])
    set({ currentPage: page, selectedEntityId: entityId ?? null })
  },
  goBack: () => {
    if (typeof window !== 'undefined') window.history.back()
  },
  syncFromLocation: () => {
    if (typeof window !== 'undefined') set({ currentPage: pageFromPath(window.location.pathname), selectedEntityId: null })
  },
}))
