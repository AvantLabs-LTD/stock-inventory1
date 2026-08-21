import { create } from 'zustand'

export type AppPage =
  | 'dashboard'
  | 'items'
  | 'demands'
  | 'purchasing'
  | 'inventory'
  | 'reference-data'
  | 'users'

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
    void get()
    set({ currentPage: 'dashboard', selectedEntityId: null })
  },
}))
