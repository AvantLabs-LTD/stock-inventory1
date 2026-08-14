"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuthStore } from "@/stores/auth-store"
import { useAppStore } from "@/stores/app-store"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { TopBar } from "@/components/layout/top-bar"
import { ChangePasswordDialog } from "@/components/change-password/change-password-dialog"
import { LoginForm } from "@/components/login/login-form"
import { DashboardPage } from "@/components/dashboard/dashboard-page"
import { ProductList } from "@/components/products/product-list"
import { ProductDetail } from "@/components/products/product-detail"
import { CategoryPage } from "@/components/categories/category-page"
import { SupplierPage } from "@/components/suppliers/supplier-page"
import { StockPage } from "@/components/stock/stock-page"
import { GoodsReceivedPage } from "@/components/stock/goods-received-page"
import { StockSummaryPage } from "@/components/stock/stock-summary-page"
import { DepartmentPage } from "@/components/departments/department-page"
import { DepartmentDetail } from "@/components/departments/department-detail"
import { ProjectPage } from "@/components/projects/project-page"
import { ProjectDetail } from "@/components/projects/project-detail"
import { IssueInventoryPage } from '@/components/issues/issue-inventory-page'
import { ReservedInventoryPage } from '@/components/reserved/reserved-inventory-page'
import { ReturnsPage } from '@/components/returns/returns-page'
import { AdjustmentsPage } from '@/components/adjustments/adjustments-page'
import { RequestPage } from '@/components/requests/request-page'
import { HistoryPage } from '@/components/history/history-page'
import { ProductHistoryPage } from '@/components/history/product-history-page'
import { ReportsPage } from '@/components/reports/reports-page'
import { ReportView } from '@/components/reports/report-view'
import { AuditLogsPage } from '@/components/audit/audit-logs-page'
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from "@/components/theme-provider"

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold mx-auto">
          IP
        </div>
        <Skeleton className="h-4 w-48 mx-auto" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

function PageContent() {
  const currentPage = useAppStore((s) => s.currentPage)

  switch (currentPage) {
    case 'products':
      return <ProductList />
    case 'product-detail':
      return <ProductDetail />
    case 'categories':
      return <CategoryPage />
    case 'suppliers':
      return <SupplierPage />
    case 'stock':
      return <StockPage />
    case 'goods-received':
      return <GoodsReceivedPage />
    case 'stock-summary':
      return <StockSummaryPage />
    case 'departments':
      return <DepartmentPage />
    case 'department-detail':
      return <DepartmentDetail />
    case 'projects':
      return <ProjectPage />
    case 'project-detail':
      return <ProjectDetail />
    case 'issue-inventory':
      return <IssueInventoryPage />
    case 'reserved-inventory':
      return <ReservedInventoryPage />
    case 'returns':
      return <ReturnsPage />
    case 'stock-adjustments':
      return <AdjustmentsPage />
    case 'requests':
      return <RequestPage />
    case 'history':
      return <HistoryPage />
    case 'product-history':
      return <ProductHistoryPage />
    case 'reports':
      return <ReportsPage />
    case 'report-view':
      return <ReportView />
    case 'audit-logs':
      return <AuditLogsPage />
    case 'dashboard':
    default:
      return <DashboardPage />
  }
}

function AppContent() {
  const { user, isLoading, fetchUser } = useAuthStore()
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  if (isLoading) return <LoadingScreen />

  if (!user) return <LoginForm />

  return (
    <>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopBar onChangePassword={() => setChangePasswordOpen(true)} />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <PageContent />
          </main>
        </SidebarInset>
      </SidebarProvider>
      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
      />
    </>
  )
}

export function AppShell() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <div className="min-h-screen bg-background">
        <AppContent />
      </div>
      <Toaster />
    </ThemeProvider>
  )
}
