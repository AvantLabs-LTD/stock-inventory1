"use client"

import {
  LayoutDashboard,
  ArrowLeftRight,
  Building2,
  FolderKanban,
  ScrollText,
  Boxes,
  ClipboardCheck,
  ShoppingCart,
} from "lucide-react"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth-store"
import { useAppStore, type AppPage } from "@/stores/app-store"
import { useSidebar } from "@/components/ui/sidebar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface NavItem {
  title: string
  icon: React.ElementType
  page: AppPage
  module: string
  action: string
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    page: "dashboard",
    module: "dashboard",
    action: "view",
  },
  {
    title: "Components",
    icon: Boxes,
    page: "components",
    module: "components",
    action: "view",
  },
]

const inventoryItems: NavItem[] = [
  {
    title: "Inventory Ledger",
    icon: ArrowLeftRight,
    page: "inventory",
    module: "stock",
    action: "view",
  },
]

const orgItems: NavItem[] = [
  {
    title: "Departments",
    icon: Building2,
    page: "departments",
    module: "departments",
    action: "view",
  },
  {
    title: "Projects",
    icon: FolderKanban,
    page: "projects",
    module: "projects",
    action: "view",
  },
]

const workflowItems: NavItem[] = [
  {
    title: "Demand & Cycles",
    icon: ClipboardCheck,
    page: "reservations",
    module: "reservations",
    action: "view",
  },
  {
    title: "Purchase Requests",
    icon: ShoppingCart,
    page: "purchase-requests",
    module: "purchase_requests",
    action: "view",
  },
]

const systemItems: NavItem[] = [
  {
    title: "Audit Logs",
    icon: ScrollText,
    page: "audit-logs",
    module: "audit_logs",
    action: "view",
  },
]

function filterByPermission(items: NavItem[], role: string): NavItem[] {
  return items.filter((item) => hasPermission(role, item.module as never, item.action as never))
}

function NavSection({
  label,
  items,
  currentPage,
  onNavigate,
}: {
  label: string
  items: NavItem[]
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
}) {
  if (items.length === 0) return null

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={`${item.page}-${item.title}`}>
            <SidebarMenuButton
              isActive={currentPage === item.page && item.page !== "dashboard"}
              tooltip={item.title}
              onClick={() => onNavigate(item.page)}
            >
              <item.icon className="size-4" />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}

export function AppSidebar() {
  const user = useAuthStore((s) => s.user)
  const currentPage = useAppStore((s) => s.currentPage)
  const navigate = useAppStore((s) => s.navigate)
  const { setOpenMobile } = useSidebar()

  if (!user) return null

  const filteredNav = filterByPermission(navItems, user.role)
  const filteredInventory = filterByPermission(inventoryItems, user.role)
  const filteredOrg = filterByPermission(orgItems, user.role)
  const filteredWorkflow = filterByPermission(workflowItems, user.role)
  const filteredSystem = filterByPermission(systemItems, user.role)

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  function handleNavigate(page: AppPage) {
    navigate(page)
    // Close mobile sidebar
    setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            IP
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight">InventoryPro</span>
            <span className="text-[10px] text-muted-foreground">Inventory Management</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <NavSection label="Overview" items={filteredNav.slice(0, 1)} currentPage={currentPage} onNavigate={handleNavigate} />
        <SidebarSeparator />
        <NavSection label="Catalogue" items={filteredNav.slice(1)} currentPage={currentPage} onNavigate={handleNavigate} />
        <SidebarSeparator />
        <NavSection label="Inventory" items={filteredInventory} currentPage={currentPage} onNavigate={handleNavigate} />
        <SidebarSeparator />
        <NavSection label="Organization" items={filteredOrg} currentPage={currentPage} onNavigate={handleNavigate} />
        <SidebarSeparator />
        <NavSection label="Operations" items={filteredWorkflow} currentPage={currentPage} onNavigate={handleNavigate} />
        <SidebarSeparator />
        <NavSection label="System" items={filteredSystem} currentPage={currentPage} onNavigate={handleNavigate} />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col group-data-[collapsible=icon]:hidden min-w-0">
            <span className="text-sm font-medium truncate">{user.name}</span>
            <span className="text-[10px] text-muted-foreground truncate">
              {user.role.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
