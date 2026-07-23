"use client"

import { Bell, Moon, Sun, LogOut, KeyRound, User, CheckCircle2, AlertTriangle, XCircle, PackageX } from "lucide-react"
import { useTheme } from "next-themes"
import { useAuthStore } from "@/stores/auth-store"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useState, useEffect, useSyncExternalStore } from "react"

interface Notification {
  id: string
  type: string
  message: string
  date: string
  read: boolean
}

interface TopBarProps {
  onChangePassword?: () => void
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "pending_requests":
      return <Bell className="size-4 text-amber-500" />
    case "out_of_stock":
      return <PackageX className="size-4 text-red-500" />
    case "low_stock":
      return <AlertTriangle className="size-4 text-orange-500" />
    case "request_approved":
      return <CheckCircle2 className="size-4 text-emerald-500" />
    case "request_rejected":
      return <XCircle className="size-4 text-red-500" />
    default:
      return <Bell className="size-4 text-muted-foreground" />
  }
}

function getNotificationBg(type: string) {
  switch (type) {
    case "pending_requests":
      return "bg-amber-50 dark:bg-amber-950/20"
    case "out_of_stock":
      return "bg-red-50 dark:bg-red-950/20"
    case "low_stock":
      return "bg-orange-50 dark:bg-orange-950/20"
    case "request_approved":
      return "bg-emerald-50 dark:bg-emerald-950/20"
    case "request_rejected":
      return "bg-red-50 dark:bg-red-950/20"
    default:
      return ""
  }
}

export function TopBar({ onChangePassword }: TopBarProps) {
  const { setTheme, theme } = useTheme()
  const { user, logout } = useAuthStore()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setNotifications(data.data || [])
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleMarkRead = async (id: string) => {
    setReadIds((prev) => new Set(prev).add(id))
    try {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: "POST",
      })
    } catch {
      // Silently fail
    }
  }

  const unreadCount = notifications.filter(
    (n) => !n.read && !readIds.has(n.id)
  ).length

  if (!user) return null

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const roleColorMap: Record<string, string> = {
    SUPER_ADMIN: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    INVENTORY_ADMIN: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    STORE_KEEPER: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    DEPARTMENT_USER: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    VIEWER: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  }

  const roleLabel = user.role.replace(/_/g, " ")

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      <div className="flex flex-1 items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          {user.departmentName ? `${user.departmentName}` : "InventoryPro"}
        </h2>
      </div>

      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
            <span className="sr-only">Toggle theme</span>
          </Button>
        )}

        {/* Notifications */}
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 relative">
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <Badge className="absolute -right-0.5 -top-0.5 size-4 p-0 flex items-center justify-center text-[9px]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
              <span className="sr-only">Notifications</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end" forceMount>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <ScrollArea className="max-h-96">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Bell className="size-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications</p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((notif) => {
                    const isRead = notif.read || readIds.has(notif.id)
                    return (
                      <button
                        key={notif.id}
                        className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${getNotificationBg(notif.type)} ${isRead ? "opacity-60" : ""}`}
                        onClick={() => handleMarkRead(notif.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">
                            {getNotificationIcon(notif.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-snug">
                              {notif.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(notif.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
                <Badge
                  variant="secondary"
                  className={`mt-1 w-fit text-[10px] px-1.5 py-0 ${roleColorMap[user.role] || ""}`}
                >
                  {roleLabel}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onChangePassword}>
                <KeyRound className="mr-2 size-4" />
                <span>Change Password</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <User className="mr-2 size-4" />
                <span>Profile</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600 dark:text-red-400"
              onClick={() => logout()}
            >
              <LogOut className="mr-2 size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
