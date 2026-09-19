"use client"

import { Boxes, ClipboardList, Package, ShoppingCart, Users, Wallet } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"
import { useAppStore, type AppPage } from "@/stores/app-store"
import { PageHeader } from "@/components/shared/page-header"
import { Card, CardContent } from "@/components/ui/card"

const modules: Array<{ page: AppPage; title: string; subtitle: string; icon: typeof Boxes; permission?: string; available: boolean }> = [
  { page: "dashboard", title: "Vault", subtitle: "Inventory, stock movements and demands", icon: Boxes, permission: "vault.overview.view", available: true },
  { page: "cargo", title: "Cargo", subtitle: "Packages and shipment journeys", icon: Package, permission: "cargo.view", available: true },
  { page: "orders", title: "Orders", subtitle: "Procurement", icon: ShoppingCart, permission: "orders.view", available: true },
  { page: "people", title: "People", subtitle: "HR", icon: Users, available: false },
  { page: "ledger", title: "Ledger", subtitle: "Finance", icon: Wallet, available: false },
]

export function FluxHome() {
  const permissions = useAuthStore(state => state.user?.permissions || [])
  const navigate = useAppStore(state => state.navigate)
  return <div className="space-y-6"><PageHeader title="Flux" description="One workspace for the operational modules of your ERP." icon={ClipboardList}/>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{modules.map(module => {
      const allowed = !module.permission || permissions.includes(module.permission)
      return <button key={module.page} type="button" onClick={() => navigate(module.page)} disabled={!allowed}
        className="text-left disabled:opacity-50"><Card className="h-full transition-colors hover:border-primary/50"><CardContent className="flex min-h-32 items-start gap-4 p-5"><div className="rounded-xl bg-primary/10 p-3"><module.icon className="size-5 text-primary"/></div><div><div className="flex items-center gap-2 font-semibold">{module.title}{!module.available&&<span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Planned</span>}</div><div className="mt-1 text-sm text-muted-foreground">{module.subtitle}</div></div></CardContent></Card></button>
    })}</div>
  </div>
}

export function PlannedModule({ name }: { name: string }) {
  return <div className="space-y-6"><PageHeader title={name} description="This Flux module is planned; no operational workflow is available here yet." icon={Package}/>
    <Card><CardContent className="p-8 text-sm text-muted-foreground">The module will be enabled only after its workflow, data model and permissions are approved.</CardContent></Card></div>
}
