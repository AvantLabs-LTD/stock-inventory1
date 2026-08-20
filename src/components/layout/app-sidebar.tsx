"use client"
import { Boxes, ClipboardList, Gauge, ShoppingCart, Tags, Warehouse } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"
import { useAppStore, type AppPage } from "@/stores/app-store"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from "@/components/ui/sidebar"

const items: Array<{ title:string; page:AppPage; icon:React.ElementType }> = [
  { title:"Overview", page:"dashboard", icon:Gauge },
  { title:"Items", page:"items", icon:Boxes },
  { title:"Demands", page:"demands", icon:ClipboardList },
  { title:"Purchasing", page:"purchasing", icon:ShoppingCart },
  { title:"Inventory ledger", page:"inventory", icon:Warehouse },
  { title:"Tags & reference data", page:"reference-data", icon:Tags },
]
export function AppSidebar() {
  const user=useAuthStore(s=>s.user), current=useAppStore(s=>s.currentPage), navigate=useAppStore(s=>s.navigate), {setOpenMobile}=useSidebar()
  if(!user)return null
  const initials=user.name.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()
  return <Sidebar collapsible="icon"><SidebarHeader className="border-b px-4 py-3"><div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">SP</div><div className="group-data-[collapsible=icon]:hidden"><div className="text-sm font-semibold">Store Portal</div><div className="text-[10px] text-muted-foreground">Demand · stock · purchasing</div></div></div></SidebarHeader>
    <SidebarContent><SidebarGroup><SidebarGroupLabel>Workspace</SidebarGroupLabel><SidebarMenu>{items.map(x=><SidebarMenuItem key={x.page}><SidebarMenuButton isActive={current===x.page} tooltip={x.title} onClick={()=>{navigate(x.page);setOpenMobile(false)}}><x.icon className="size-4"/><span>{x.title}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroup></SidebarContent>
    <SidebarFooter className="border-t p-2"><div className="flex items-center gap-3 px-2 py-1.5"><Avatar className="size-8"><AvatarFallback>{initials}</AvatarFallback></Avatar><div className="min-w-0 group-data-[collapsible=icon]:hidden"><div className="truncate text-sm font-medium">{user.name}</div><div className="truncate text-[10px] text-muted-foreground">Authenticated user</div></div></div></SidebarFooter><SidebarRail/></Sidebar>
}
