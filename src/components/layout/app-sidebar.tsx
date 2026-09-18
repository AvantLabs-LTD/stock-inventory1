"use client"

import { Boxes, ClipboardList, Gauge, Package, Settings2, ShoppingCart, Users, Warehouse } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"
import { useAppStore, type AppPage } from "@/stores/app-store"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from "@/components/ui/sidebar"

const vaultItems: Array<{ title: string; page: AppPage; permission: string; icon: React.ElementType }> = [
  { title: "Overview", page: "dashboard", permission: "vault.overview.view", icon: Gauge },
  { title: "Inventory", page: "items", permission: "vault.catalogue.view", icon: Boxes },
  { title: "Stock Movements", page: "inventory", permission: "vault.stock.view", icon: Warehouse },
  { title: "Demands", page: "demands", permission: "vault.demands.view", icon: ClipboardList },
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
      {vaultItems.some((item) => allowed(item.permission)) && <SidebarGroup><SidebarGroupLabel>Vault · Store</SidebarGroupLabel><SidebarMenu>
        {vaultItems.filter((item) => allowed(item.permission)).map((item) => <SidebarMenuItem key={item.page}><SidebarMenuButton isActive={current === item.page} tooltip={item.title} onClick={() => go(item.page)}><item.icon className="size-4"/><span>{item.title}</span></SidebarMenuButton></SidebarMenuItem>)}
      </SidebarMenu></SidebarGroup>}
      <SidebarGroup><SidebarGroupLabel>Modules</SidebarGroupLabel><SidebarMenu>
        {allowed("cargo.view") && <SidebarMenuItem><SidebarMenuButton isActive={current === "cargo"} tooltip="Cargo · Logistics" onClick={() => go("cargo")}><Package className="size-4"/><span>Cargo</span></SidebarMenuButton></SidebarMenuItem>}
        <SidebarMenuItem><SidebarMenuButton isActive={current === "orders"} tooltip="Orders · Procurement" onClick={() => go("orders")}><ShoppingCart className="size-4"/><span>Orders <span className="text-xs text-muted-foreground">planned</span></span></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroup>
      {(allowed("flux.users.manage") || allowed("vault.reference.manage")) && <SidebarGroup><SidebarGroupLabel>Administration</SidebarGroupLabel><SidebarMenu>
        {allowed("flux.users.manage") && <SidebarMenuItem><SidebarMenuButton isActive={current === "users"} tooltip="Users & access" onClick={() => go("users")}><Users className="size-4"/><span>Users & access</span></SidebarMenuButton></SidebarMenuItem>}
        {allowed("vault.reference.manage") && <SidebarMenuItem><SidebarMenuButton isActive={current === "reference-data"} tooltip="Vault reference data" onClick={() => go("reference-data")}><Settings2 className="size-4"/><span>Vault reference data</span></SidebarMenuButton></SidebarMenuItem>}
      </SidebarMenu></SidebarGroup>}
    </SidebarContent>
    <SidebarFooter className="border-t p-2"><div className="flex items-center gap-3 px-2 py-1.5"><Avatar className="size-8"><AvatarFallback>{initials}</AvatarFallback></Avatar><div className="min-w-0 group-data-[collapsible=icon]:hidden"><div className="truncate text-sm font-medium">{user.name}</div><div className="truncate text-[10px] text-muted-foreground">{user.groups?.map(group => group.name).join(", ") || "Flux user"}</div></div></div></SidebarFooter><SidebarRail/>
  </Sidebar>
}
