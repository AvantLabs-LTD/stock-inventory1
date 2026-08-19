import { create } from 'zustand'

export type AppPage =
  | 'dashboard'
  | 'products'
  | 'product-detail'
  | 'categories'
  | 'suppliers'
  | 'stock'
  | 'goods-received'
  | 'stock-summary'
  | 'departments'
  | 'department-detail'
  | 'projects'
  | 'project-detail'
  | 'issue-inventory'
  | 'returns'
  | 'stock-adjustments'
  | 'reserved-inventory'
  | 'requests'
  | 'history'
  | 'product-history'
  | 'reports'
  | 'report-view'
  | 'audit-logs'
  | 'components'
  | 'reservations'
  | 'purchase-requests'

interface AppState {
  currentPage: AppPage
  // For product detail page
  selectedProductId: string | null
  navigate: (page: AppPage, productId?: string) => void
  goBack: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  currentPage: 'dashboard',
  selectedProductId: null,
  navigate: (page, productId) =>
    set({ currentPage: page, selectedProductId: productId ?? null }),
  goBack: () => {
    const { currentPage } = get()
    if (currentPage === 'product-detail') set({ currentPage: 'products', selectedProductId: null })
    else if (currentPage === 'department-detail') set({ currentPage: 'departments', selectedProductId: null })
    else if (currentPage === 'project-detail') set({ currentPage: 'projects', selectedProductId: null })
    else if (currentPage === 'reserved-inventory') set({ currentPage: 'dashboard', selectedProductId: null })
    else if (currentPage === 'requests') set({ currentPage: 'dashboard', selectedProductId: null })
    else if (currentPage === 'history') set({ currentPage: 'dashboard', selectedProductId: null })
    else if (currentPage === 'product-history') set({ currentPage: 'history', selectedProductId: null })
    else if (currentPage === 'report-view') set({ currentPage: 'reports', selectedProductId: null })
    else if (currentPage === 'reports') set({ currentPage: 'dashboard', selectedProductId: null })
    else if (currentPage === 'audit-logs') set({ currentPage: 'dashboard', selectedProductId: null })
    else if (currentPage === 'components' || currentPage === 'reservations' || currentPage === 'purchase-requests') set({ currentPage: 'dashboard', selectedProductId: null })
    else set({ currentPage: 'dashboard', selectedProductId: null })
  },
}))
