"use client"

import { useEffect, useState } from "react"
import {
  ArrowUpFromLine,
  AlertTriangle,
  PackageX,
  ClipboardList,
  ArrowDownToLine,
  BarChart3,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthStore } from "@/stores/auth-store"
import { useAppStore } from "@/stores/app-store"
import { StockOverviewWidget } from "@/components/stock/stock-overview-widget"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

interface ChartData {
  month: string
  received: number
  issued: number
  returned: number
}

interface OverviewStats {
  totalProducts: number
  totalStock: number
  totalAvailable: number
  totalReserved: number
  totalIssued: number
  lowStockCount: number
  outOfStockCount: number
  todayReceived: number
  todayIssued: number
  pendingRequests: number
}

interface StatCardProps {
  title: string
  value: string | number
  description?: string
  icon: React.ElementType
  iconColor: string
  iconBg: string
  onClick?: () => void
  clickable?: boolean
}

function StatCard({ title, value, description, icon: Icon, iconColor, iconBg, onClick, clickable }: StatCardProps) {
  return (
    <Card className={clickable ? "cursor-pointer hover:shadow-md transition-shadow" : ""} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={`flex size-10 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className={`size-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return <Skeleton className="h-[240px] w-full rounded-lg" />
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useAppStore((s) => s.navigate)
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [chartLoading, setChartLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Fetch stock overview
    fetch("/api/stock/overview")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setStats(d)
          // Also fetch pending requests count
          return fetch("/api/requests?status=PENDING&pageSize=1")
        }
      })
      .then((r) => r && r.json())
      .then((d) => {
        if (!cancelled && d && typeof d.pagination?.total === "number") {
          setStats((prev) => prev ? { ...prev, pendingRequests: d.pagination.total } : prev)
        }
      })
      .catch(() => {})

    // Fetch chart data
    fetch("/api/dashboard/chart-data")
      .then((r) => r.json())
      .then((d) => { if (!cancelled && Array.isArray(d)) setChartData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChartLoading(false) })

    return () => { cancelled = true }
  }, [])

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 17) return "Good afternoon"
    return "Good evening"
  }

  const roleColorMap: Record<string, string> = {
    SUPER_ADMIN: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    INVENTORY_ADMIN: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    STORE_KEEPER: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    DEPARTMENT_USER: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    VIEWER: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting()}, {user?.name?.split(" ")[0]}!
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s an overview of your inventory system.
        </p>
      </div>

      {/* Live Inventory Overview Widget */}
      <StockOverviewWidget />

      {/* Additional Stat Cards — real data */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Issued Stock"
          value={stats?.totalIssued ?? "--"}
          description="Distributed to departments"
          icon={ArrowUpFromLine}
          iconColor="text-orange-600 dark:text-orange-400"
          iconBg="bg-orange-100 dark:bg-orange-900/30"
        />
        <StatCard
          title="Low Stock Items"
          value={stats?.lowStockCount ?? "--"}
          description="Below minimum level"
          icon={AlertTriangle}
          iconColor="text-red-600 dark:text-red-400"
          iconBg="bg-red-100 dark:bg-red-900/30"
          clickable
          onClick={() => navigate("products")}
        />
        <StatCard
          title="Out of Stock"
          value={stats?.outOfStockCount ?? "--"}
          description="Need replenishment"
          icon={PackageX}
          iconColor="text-rose-600 dark:text-rose-400"
          iconBg="bg-rose-100 dark:bg-rose-900/30"
          clickable
          onClick={() => navigate("products")}
        />
        <StatCard
          title="Pending Requests"
          value={stats?.pendingRequests ?? "--"}
          description="Awaiting approval"
          icon={ClipboardList}
          iconColor="text-cyan-600 dark:text-cyan-400"
          iconBg="bg-cyan-100 dark:bg-cyan-900/30"
          clickable
          onClick={() => navigate("requests")}
        />
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Today's Activity — real data */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowDownToLine className="size-4" />
              Today&apos;s Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Items Received</span>
              <Badge variant="secondary" className="font-mono">
                {stats?.todayReceived ?? "--"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Items Issued</span>
              <Badge variant="secondary" className="font-mono">
                {stats?.todayIssued ?? "--"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Chart */}
        <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="size-4" />
              Monthly Overview
            </CardTitle>
            <CardDescription>Inventory movements (last 6 months)</CardDescription>
          </CardHeader>
          <CardContent>
            {chartLoading ? (
              <ChartSkeleton />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    tickFormatter={(v: string) => v.split(" ")[0]}
                  />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      backgroundColor: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="received" name="Received" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="issued" name="Issued" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="returned" name="Returned" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed bg-muted/30">
                <p className="text-sm text-muted-foreground">No data available yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Role</span>
              <Badge
                variant="secondary"
                className={`text-[10px] ${roleColorMap[user?.role || "VIEWER"] || ""}`}
              >
                {user?.role?.replace(/_/g, " ") || "N/A"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Department</span>
              <span className="text-sm font-medium">{user?.departmentName || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium truncate max-w-[180px]">{user?.email || "—"}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
