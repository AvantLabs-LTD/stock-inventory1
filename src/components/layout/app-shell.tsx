"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuthStore } from "@/stores/auth-store"
import { useAppStore } from "@/stores/app-store"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { TopBar } from "@/components/layout/top-bar"
import { ChangePasswordDialog } from "@/components/change-password/change-password-dialog"
import { LoginForm } from "@/components/login/login-form"
import { InventoryPage, ItemsPage, OverviewPage, ReferenceDataPage } from "@/components/streamlined/pages"
import { DemandsPage, PurchasingPage } from "@/components/streamlined/demand-purchase-pages"
import { UsersPage } from "@/components/users/users-page"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { FluxHome, PlannedModule } from "@/components/layout/flux-home"

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold mx-auto">
          F
        </div>
        <Skeleton className="h-4 w-48 mx-auto" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

function PageContent() {
  const currentPage = useAppStore((s) => s.currentPage)
  const permissions = useAuthStore(state => state.user?.permissions || [])

  const required: Partial<Record<typeof currentPage, string>> = {
    dashboard: "vault.overview.view", items: "vault.catalogue.view", demands: "vault.demands.view",
    inventory: "vault.stock.view", purchasing: "vault.purchasing.view",
    users: "flux.users.manage", "reference-data": "vault.reference.manage",
  }
  if (required[currentPage] && !permissions.includes(required[currentPage])) {
    return <div className="p-8 text-sm text-muted-foreground">You do not have access to Vault.</div>
  }

  switch (currentPage) {
    case 'flux': return <FluxHome />
    case 'cargo': return <PlannedModule name="Cargo" />
    case 'orders': return <PlannedModule name="Orders" />
    case 'people': return <PlannedModule name="People" />
    case 'ledger': return <PlannedModule name="Ledger" />
    case 'items':
      return <ItemsPage />
    case 'demands':
      return <DemandsPage />
    case 'purchasing':
      return <PurchasingPage />
    case 'inventory':
      return <InventoryPage />
    case 'reference-data':
      return <ReferenceDataPage />
    case 'users':
      return <UsersPage />
    case 'dashboard':
      return <OverviewPage />
    default:
      return <FluxHome />
  }
}

function AppContent() {
  const { user, isLoading, fetchUser } = useAuthStore()
  const syncFromLocation = useAppStore(state => state.syncFromLocation)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  useEffect(() => {
    fetchUser()
  }, [fetchUser])
  useEffect(() => {
    syncFromLocation()
    window.addEventListener("popstate", syncFromLocation)
    return () => window.removeEventListener("popstate", syncFromLocation)
  }, [syncFromLocation])

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
