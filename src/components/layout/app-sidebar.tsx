"use client"

import {
  LayoutDashboard,
  Package,

  ArrowDownToLine,
  Building2,
  FolderKanban,
  ArrowUpFromLine,
  Lock,
  ClipboardList,
  RotateCcw,
  SlidersHorizontal,
  BarChart3,
  ScrollText,
  Users,
  PackageCheck,
  History,
  Timer,
} from "lucide-react"
import { cn } from "@/lib/utils"
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
    title: "Products",
    icon: Package,
    page: "products",
    module: "products",
    action: "view",
  },

]

const inventoryItems: NavItem[] = [
  {
    title: "Stock",
    icon: ArrowDownToLine,
    page: "opening-stock",
    module: "stock",
    action: "view",
  },
  {
    title: "Goods Received",
    icon: PackageCheck,
    page: "goods-received",
    module: "stock",
    action: "view",
  },
  {
    title: "Issue Inventory",
    icon: ArrowUpFromLine,
    page: "issue-inventory",
    module: "issue_inventory",
    action: "view",
  },
  {
    title: "Reserved Inventory",
    icon: Lock,
    page: "reserved-inventory",
    module: "reserved_inventory",
    action: "view",
  },
  {
    title: "Returns",
    icon: RotateCcw,
    page: "returns",
    module: "returns",
    action: "view",
  },
  {
    title: "Stock Adjustments",
    icon: SlidersHorizontal,
    page: "stock-adjustments",
    module: "stock",
    action: "adjust",
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
    title: "Inventory Requests",
    icon: ClipboardList,
    page: "requests",
    module: "inventory_requests",
    action: "view",
  },
]

const reportItems: NavItem[] = [
  {
    title: "Transaction History",
    icon: History,
    page: "history",
    module: "reports",
    action: "view",
  },
  {
    title: "Product History",
    icon: Timer,
    page: "product-history",
    module: "reports",
    action: "view",
  },
]

const systemItems: NavItem[] = [
  {
    title: "Reports",
    icon: BarChart3,
    page: "reports",
    module: "reports",
    action: "view",
  },
  {
    title: "Audit Logs",
    icon: ScrollText,
    page: "audit-logs",
    module: "audit_logs",
    action: "view",
  },
  {
    title: "User Management",
    icon: Users,
    page: "dashboard",
    module: "user_management",
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
  const filteredReports = filterByPermission(reportItems, user.role)
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
        <NavSection label="Inventory Master" items={filteredNav.slice(1)} currentPage={currentPage} onNavigate={handleNavigate} />
        <SidebarSeparator />
        <NavSection label="Stock Operations" items={filteredInventory} currentPage={currentPage} onNavigate={handleNavigate} />
        <SidebarSeparator />
        <NavSection label="Organization" items={filteredOrg} currentPage={currentPage} onNavigate={handleNavigate} />
        <SidebarSeparator />
        <NavSection label="Workflow" items={filteredWorkflow} currentPage={currentPage} onNavigate={handleNavigate} />
        <SidebarSeparator />
        <NavSection label="Reports" items={filteredReports} currentPage={currentPage} onNavigate={handleNavigate} />
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
