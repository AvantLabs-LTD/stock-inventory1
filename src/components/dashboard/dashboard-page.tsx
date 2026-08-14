"use client"

import { useEffect, useState } from "react"
import {
  Package,
  Layers,
  CheckCircle,
  Lock,
  ArrowUpFromLine,
  ArrowDownToLine,
  RotateCcw,
  AlertTriangle,
  PackageX,
  ClipboardList,
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
  todayReturned: number
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
    <Card
      className={"hover:shadow-md transition-shadow" + (clickable ? " cursor-pointer" : "")}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={"flex size-10 items-center justify-center rounded-lg shrink-0 " + iconBg}>
            <Icon className={"size-5 " + iconColor} />
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
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-[300px] rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return <Skeleton className="h-[280px] w-full rounded-lg" />
}

function StockDistributionCard({ stats }: { stats: OverviewStats }) {
  const total = stats.totalStock || 1
  const availablePct = ((stats.totalAvailable / total) * 100).toFixed(1)
  const reservedPct = ((stats.totalReserved / total) * 100).toFixed(1)
  const issuedPct = ((stats.totalIssued / total) * 100).toFixed(1)

  const bars = [
    {
      label: "Available",
      value: stats.totalAvailable,
      pct: availablePct,
      color: "bg-emerald-500 dark:bg-emerald-400",
      textColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Reserved",
      value: stats.totalReserved,
      pct: reservedPct,
      color: "bg-amber-500 dark:bg-amber-400",
      textColor: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Issued",
      value: stats.totalIssued,
      pct: issuedPct,
      color: "bg-orange-500 dark:bg-orange-400",
      textColor: "text-orange-600 dark:text-orange-400",
    },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Layers className="size-4" />
          Stock Distribution
        </CardTitle>
        <CardDescription>Breakdown of total stock ({stats.totalStock.toLocaleString()} units)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {bars.map((bar) => (
          <div key={bar.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{bar.label}</span>
              <span className={"text-sm font-semibold " + bar.textColor}>
                {bar.value.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground ml-1.5">
                  ({bar.pct}%)
                </span>
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={"h-full rounded-full transition-all duration-500 " + bar.color}
                style={{ width: bar.pct + "%" }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useAppStore((s) => s.navigate)
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Fetch stock overview
    fetch("/api/stock/overview")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setStats(d)
          return fetch("/api/requests?status=PENDING&pageSize=1")
        }
      })
      .then((r) => r && r.json())
      .then((d) => {
        if (!cancelled && d && typeof d.pagination?.total === "number") {
          setStats((prev) => (prev ? { ...prev, pendingRequests: d.pagination.total } : prev))
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // Fetch chart data
    fetch("/api/dashboard/chart-data")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d)) setChartData(d)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChartLoading(false)
      })

    return () => {
      cancelled = true
    }
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

  if (loading) return <DashboardSkeleton />

  return (
    <div className="space-y-6">
      {/* 1. Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting()}, {user?.name?.split(" ")[0]}!
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s an overview of your inventory system.
        </p>
      </div>

      {/* 2. Primary Inventory Summary Cards (StockOverviewWidget) */}
      <StockOverviewWidget />

      {/* 3. Key Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Inventory Items"
          value={stats?.totalProducts ?? "--"}
          description="Unique products tracked"
          icon={Package}
          iconColor="text-slate-600 dark:text-slate-400"
          iconBg="bg-slate-100 dark:bg-slate-900/30"
        />
        <StatCard
          title="Current Total Stock"
          value={stats?.totalStock ?? "--"}
          description="All stock units combined"
          icon={Layers}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-100 dark:bg-emerald-900/30"
        />
        <StatCard
          title="Available Stock"
          value={stats?.totalAvailable ?? "--"}
          description="Ready for issue or use"
          icon={CheckCircle}
          iconColor="text-green-600 dark:text-green-400"
          iconBg="bg-green-100 dark:bg-green-900/30"
        />
        <StatCard
          title="Reserved Stock"
          value={stats?.totalReserved ?? "--"}
          description="Held for pending orders"
          icon={Lock}
          iconColor="text-amber-600 dark:text-amber-400"
          iconBg="bg-amber-100 dark:bg-amber-900/30"
        />
      </div>

      {/* 4. Today's Activity Section */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Today&apos;s Activity</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title="Issued Today"
            value={stats?.todayIssued ?? "--"}
            description="Items distributed today"
            icon={ArrowUpFromLine}
            iconColor="text-orange-600 dark:text-orange-400"
            iconBg="bg-orange-100 dark:bg-orange-900/30"
          />
          <StatCard
            title="Goods Received Today"
            value={stats?.todayReceived ?? "--"}
            description="New stock received today"
            icon={ArrowDownToLine}
            iconColor="text-emerald-600 dark:text-emerald-400"
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
          />
          <StatCard
            title="Returned Today"
            value={stats?.todayReturned ?? "--"}
            description="Items returned today"
            icon={RotateCcw}
            iconColor="text-sky-600 dark:text-sky-400"
            iconBg="bg-sky-100 dark:bg-sky-900/30"
          />
        </div>
      </div>

      {/* 5. Alert Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Alerts</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            title="Low Stock Items"
            value={stats?.lowStockCount ?? "--"}
            description="Below minimum level — needs attention"
            icon={AlertTriangle}
            iconColor="text-red-600 dark:text-red-400"
            iconBg="bg-red-100 dark:bg-red-900/30"
            clickable
            onClick={() => navigate("products")}
          />
          <StatCard
            title="Out of Stock Items"
            value={stats?.outOfStockCount ?? "--"}
            description="Need immediate replenishment"
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
      </div>

      {/* 6. Charts Section */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Analytics</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Monthly Overview Bar Chart */}
          <Card>
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
                <ResponsiveContainer width="100%" height={280}>
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

          {/* Stock Distribution */}
          {stats ? (
            <StockDistributionCard stats={stats} />
          ) : (
            <Skeleton className="h-[280px] rounded-lg" />
          )}
        </div>
      </div>

      {/* 7. Account Info Card */}
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
  )
}
