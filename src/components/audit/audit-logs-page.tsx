"use client"

import { useEffect, useState, useCallback } from "react"
import {
  ScrollText,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/shared/page-header"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth-store"

interface AuditLogEntry {
  id: string
  userId: string | null
  userName: string | null
  action: string
  entityType: string | null
  entityId: string | null
  details: string | null
  ipAddress: string | null
  date: string
}

const ACTION_CONFIG: Record<string, { label: string; color: string }> = {
  OPENING_STOCK_SET: {
    label: "Stock",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  GOODS_RECEIVED: {
    label: "Goods Received",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  GOODS_RECEIVED_DELETED: {
    label: "GR Deleted",
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  ISSUED: {
    label: "Issued",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  },
  RETURNED: {
    label: "Returned",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  RESERVED: {
    label: "Reserved",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  },
  RELEASED: {
    label: "Released",
    color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  },
  APPROVED: {
    label: "Approved",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  REJECTED: {
    label: "Rejected",
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  COMPLETED: {
    label: "Completed",
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  ADJUSTMENT_IN: {
    label: "Adj. In",
    color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  },
  ADJUSTMENT_OUT: {
    label: "Adj. Out",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  },
}

const AUDIT_ACTIONS = [
  { value: "", label: "All Actions" },
  { value: "OPENING_STOCK_SET", label: "Stock" },
  { value: "GOODS_RECEIVED", label: "Goods Received" },
  { value: "GOODS_RECEIVED_DELETED", label: "GR Deleted" },
  { value: "ISSUED", label: "Issued" },
  { value: "RETURNED", label: "Returned" },
  { value: "RESERVED", label: "Reserved" },
  { value: "RELEASED", label: "Released" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ADJUSTMENT_IN", label: "Adjustment In" },
  { value: "ADJUSTMENT_OUT", label: "Adjustment Out" },
]

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AuditLogsPage() {
  const user = useAuthStore((s) => s.user)
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [limit, setLimit] = useState("25")

  const canView = user
    ? hasPermission(user.role, "audit_logs" as never, "view" as never)
    : false

  const fetchLogs = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })
      if (search) params.set("search", search)
      if (actionFilter) params.set("action", actionFilter)
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)

      const res = await fetch(`/api/audit-logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.data || [])
        setTotal(data.pagination?.total || 0)
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err)
    } finally {
      setLoading(false)
    }
  }, [page, search, actionFilter, dateFrom, dateTo, limit, canView])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const totalPages = Math.ceil(total / parseInt(limit, 10))

  const clearFilters = () => {
    setSearch("")
    setActionFilter("")
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }

  const hasFilters = search || actionFilter || dateFrom || dateTo

  if (!canView) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-20">
          <div className="text-center">
            <ScrollText className="size-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Access Denied</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You don&apos;t have permission to view audit logs.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Track all system activities and changes across the inventory."
        icon={ScrollText}
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by user, details, entity..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9"
              />
            </div>
            <Select
              value={actionFilter}
              onValueChange={(v) => {
                setActionFilter(v === "all" ? "" : v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                {AUDIT_ACTIONS.map((a) => (
                  <SelectItem key={a.value || "all"} value={a.value || "all"}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              className="w-full sm:w-auto"
              placeholder="From date"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              className="w-full sm:w-auto"
              placeholder="To date"
            />
            <Select
              value={limit}
              onValueChange={(v) => {
                setLimit(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="icon" onClick={clearFilters}>
                <X className="size-4" />
                <span className="sr-only">Clear filters</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Audit Trail ({total} total)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScrollText className="size-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No audit logs found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {hasFilters
                  ? "Try adjusting your filters."
                  : "Audit logs will appear here once system activities begin."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Date</TableHead>
                      <TableHead className="w-[150px]">User</TableHead>
                      <TableHead className="w-[130px]">Action</TableHead>
                      <TableHead className="w-[130px]">Entity Type</TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Details
                      </TableHead>
                      <TableHead className="hidden md:table-cell w-[130px]">
                        IP Address
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => {
                      const actionCfg = ACTION_CONFIG[log.action] || {
                        label: log.action,
                        color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
                      }

                      return (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(log.date)}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">
                                {log.userName || "System"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] font-medium ${actionCfg.color}`}
                            >
                              {actionCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.entityType || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[300px] truncate">
                            {log.details || "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono">
                            {log.ipAddress || "—"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} &middot; {total} entries
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="size-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                      <ChevronRight className="size-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
