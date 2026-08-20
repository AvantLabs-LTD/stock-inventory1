import { create } from 'zustand'

export type AppPage =
  | 'dashboard'
  | 'departments'
  | 'department-detail'
  | 'projects'
  | 'audit-logs'
  | 'components'
  | 'reservations'
  | 'purchase-requests'
  | 'inventory'

interface AppState {
  currentPage: AppPage
  selectedEntityId: string | null
  navigate: (page: AppPage, entityId?: string) => void
  goBack: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  currentPage: 'dashboard',
  selectedEntityId: null,
  navigate: (page, entityId) =>
    set({ currentPage: page, selectedEntityId: entityId ?? null }),
  goBack: () => {
    const { currentPage } = get()
    if (currentPage === 'department-detail') set({ currentPage: 'departments', selectedEntityId: null })
    else set({ currentPage: 'dashboard', selectedEntityId: null })
  },
}))
