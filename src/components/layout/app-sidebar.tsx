"use client"

import { Boxes, ClipboardList, Factory, Gauge, GitCompareArrows, Package, Settings2, ShoppingCart, Truck, Users, Wallet, Warehouse } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"
import { useAppStore, type AppPage } from "@/stores/app-store"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from "@/components/ui/sidebar"

type NavItem = { title: string; page: AppPage; permission: string; icon: React.ElementType }

const vaultItems: NavItem[] = [
  { title: "Overview", page: "dashboard", permission: "vault.overview.view", icon: Gauge },
  { title: "Inventory", page: "items", permission: "vault.catalogue.view", icon: Boxes },
  { title: "Item simplification", page: "item-simplification", permission: "vault.catalogue.manage", icon: GitCompareArrows },
  { title: "Stock movements", page: "inventory", permission: "vault.stock.view", icon: Warehouse },
  { title: "Demands", page: "demands", permission: "vault.demands.view", icon: ClipboardList },
  { title: "Reference data", page: "reference-data", permission: "vault.reference.manage", icon: Settings2 },
]

const cargoItems: NavItem[] = [
  { title: "Shipments", page: "cargo-shipments", permission: "cargo.view", icon: Truck },
  { title: "Packages", page: "cargo-packages", permission: "cargo.view", icon: Package },
]

export function AppSidebar() {
  const user = useAuthStore((s) => s.user)
  const current = useAppStore((s) => s.currentPage)
  const navigate = useAppStore((s) => s.navigate)
  const { setOpenMobile } = useSidebar()
  if (!user) return null
  const allowed = (permission: string) => user.permissions?.includes(permission) ?? false
  const go = (page: AppPage) => { navigate(page); setOpenMobile(false) }
  const initials = user.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()
  const isActive = (page: AppPage) => current === page || (page === "cargo-shipments" && ["cargo", "cargo-tracking", "cargo-finance", "cargo-management", "cargo-reports"].includes(current))
  const navGroup = (items: NavItem[]) => <SidebarMenu>{items.filter(item => allowed(item.permission)).map(item => <SidebarMenuItem key={item.page}><SidebarMenuButton isActive={isActive(item.page)} tooltip={item.title} onClick={() => go(item.page)}><item.icon className="size-4"/><span>{item.title}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>

  return <Sidebar collapsible="icon">
    <SidebarHeader className="border-b px-4 py-3">
      <button className="flex items-center gap-2 text-left" onClick={() => go("flux")}>
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">F</span>
        <span className="group-data-[collapsible=icon]:hidden"><span className="block text-sm font-semibold">Flux</span><span className="block text-[10px] text-muted-foreground">Enterprise workspace</span></span>
      </button>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup><SidebarGroupLabel>Workspace</SidebarGroupLabel><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton isActive={current === "flux"} tooltip="Flux home" onClick={() => go("flux")}><Gauge className="size-4"/><span>Flux home</span></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroup>
      {vaultItems.some(item => allowed(item.permission)) && <SidebarGroup><SidebarGroupLabel>Vault <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">Store</span></SidebarGroupLabel>{navGroup(vaultItems)}</SidebarGroup>}
      {cargoItems.some(item => allowed(item.permission)) && <SidebarGroup><SidebarGroupLabel>Cargo <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">Logistics</span></SidebarGroupLabel>{navGroup(cargoItems)}</SidebarGroup>}
      {allowed("orders.view") && <SidebarGroup><SidebarGroupLabel>Orders <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">Procurement</span></SidebarGroupLabel><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton isActive={current === "orders"} tooltip="Orders" onClick={() => go("orders")}><ShoppingCart className="size-4"/><span>Orders</span></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroup>}
      {allowed("manufacturing.view") && <SidebarGroup><SidebarGroupLabel>Manufacturing</SidebarGroupLabel><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton isActive={current === "manufacturing"} tooltip="Manufacturing overview" onClick={() => go("manufacturing")}><Factory className="size-4"/><span>Overview</span></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton isActive={current === "manufacturing-boms" || current === "manufacturing-bom-detail"} tooltip="BOM register" onClick={() => go("manufacturing-boms")}><ClipboardList className="size-4"/><span>BOM register</span></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton isActive={current === "manufacturing-projects" || current === "manufacturing-project-detail"} tooltip="Manufacturing projects" onClick={() => go("manufacturing-projects")}><Package className="size-4"/><span>Projects</span></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton isActive={current === "manufacturing-planning"} tooltip="Production planning" onClick={() => go("manufacturing-planning")}><Gauge className="size-4"/><span>Production planning</span></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton isActive={current === "manufacturing-bom-optimization"} tooltip="BOM optimization" onClick={() => go("manufacturing-bom-optimization")}><GitCompareArrows className="size-4"/><span>BOM optimization</span></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroup>}
      <SidebarGroup><SidebarGroupLabel>Planned modules</SidebarGroupLabel><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton isActive={current === "people"} tooltip="People · HR" onClick={() => go("people")}><Users className="size-4"/><span>People <span className="text-xs text-muted-foreground">planned</span></span></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton isActive={current === "ledger"} tooltip="Ledger · Finance" onClick={() => go("ledger")}><Wallet className="size-4"/><span>Ledger <span className="text-xs text-muted-foreground">planned</span></span></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroup>
      {allowed("flux.users.manage") && <SidebarGroup><SidebarGroupLabel>Administration</SidebarGroupLabel><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton isActive={current === "users"} tooltip="Users & access" onClick={() => go("users")}><Users className="size-4"/><span>Users & access</span></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroup>}
    </SidebarContent>
    <SidebarFooter className="border-t p-2"><div className="flex items-center gap-3 px-2 py-1.5"><Avatar className="size-8"><AvatarFallback>{initials}</AvatarFallback></Avatar><div className="min-w-0 group-data-[collapsible=icon]:hidden"><div className="truncate text-sm font-medium">{user.name}</div><div className="truncate text-[10px] text-muted-foreground">{user.groups?.map(group => group.name).join(", ") || "Flux user"}</div></div></div></SidebarFooter><SidebarRail/>
  </Sidebar>
}
