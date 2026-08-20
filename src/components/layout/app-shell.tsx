"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuthStore } from "@/stores/auth-store"
import { useAppStore } from "@/stores/app-store"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { TopBar } from "@/components/layout/top-bar"
import { ChangePasswordDialog } from "@/components/change-password/change-password-dialog"
import { LoginForm } from "@/components/login/login-form"
import { CanonicalOverviewPage } from '@/components/canonical/overview-page'
import { DepartmentPage } from "@/components/departments/department-page"
import { DepartmentDetail } from "@/components/departments/department-detail"
import { AuditLogsPage } from '@/components/audit/audit-logs-page'
import { ComponentsPage } from '@/components/canonical/components-page'
import { ReservationsPage } from '@/components/canonical/reservations-page'
import { PurchaseRequestsPage } from '@/components/canonical/purchase-requests-page'
import { InventoryPage } from '@/components/canonical/inventory-page'
import { CanonicalProjectsPage } from '@/components/canonical/projects-page'
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
    case 'departments':
      return <DepartmentPage />
    case 'department-detail':
      return <DepartmentDetail />
    case 'projects':
      return <CanonicalProjectsPage />
    case 'audit-logs':
      return <AuditLogsPage />
    case 'components':
      return <ComponentsPage />
    case 'reservations':
      return <ReservationsPage />
    case 'purchase-requests':
      return <PurchaseRequestsPage />
    case 'inventory':
      return <InventoryPage />
    case 'dashboard':
    default:
      return <CanonicalOverviewPage />
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
