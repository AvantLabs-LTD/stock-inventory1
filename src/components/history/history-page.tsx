"use client"

import { useEffect, useState, useCallback } from "react"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCcw,
  Plus,
  Minus,
  Search,
  Filter,
  History,
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
import { useAppStore } from "@/stores/app-store"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth-store"

interface Transaction {
  id: string
  productId: string
  type: string
  quantity: number
  reference: string | null
  remarks: string | null
  date: string
  product: { name: string; code: string; sku: string } | null
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  OPENING_STOCK: { label: "Opening Stock", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: ArrowDownToLine },
  GOODS_RECEIVED: { label: "Goods Received", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: Plus },
  ISSUED: { label: "Issued", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: ArrowUpFromLine },
  RETURNED: { label: "Returned", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: RotateCcw },
  ADJUSTMENT_IN: { label: "Adjustment In", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400", icon: Plus },
  ADJUSTMENT_OUT: { label: "Adjustment Out", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: Minus },
}

const TRANSACTION_TYPES = [
  { value: "", label: "All Types" },
  { value: "OPENING_STOCK", label: "Opening Stock" },
  { value: "GOODS_RECEIVED", label: "Goods Received" },
  { value: "ISSUED", label: "Issued" },
  { value: "RETURNED", label: "Returned" },
  { value: "ADJUSTMENT_IN", label: "Adjustment In" },
  { value: "ADJUSTMENT_OUT", label: "Adjustment Out" },
]

function formatQuantity(type: string, quantity: number): { text: string; color: string } {
  const isOutflow = type === "ISSUED" || type === "ADJUSTMENT_OUT"
  return {
    text: `${isOutflow ? "-" : "+"}${quantity}`,
    color: isOutflow ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
  }
}

export function HistoryPage() {
  const user = useAuthStore((s) => s.user)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const limit = 25

  const canView = user ? hasPermission(user.role, "stock" as never, "view" as never) : false

  const fetchHistory = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })
      if (search) params.set("search", search)
      if (typeFilter) params.set("type", typeFilter)
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)

      const res = await fetch(`/api/inventory/history?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTransactions(data.transactions || [])
        setTotal(data.total || 0)
      }
    } catch (err) {
      console.error("Failed to fetch history:", err)
    } finally {
      setLoading(false)
    }
  }, [page, search, typeFilter, dateFrom, dateTo, canView])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const totalPages = Math.ceil(total / limit)

  if (!canView) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-20">
          <div className="text-center">
            <History className="size-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Access Denied</h3>
            <p className="text-sm text-muted-foreground mt-1">You don't have permission to view inventory history.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventory History</h1>
        <p className="text-muted-foreground mt-1">Complete transaction timeline for all inventory movements.</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPES.map((t) => (
                  <SelectItem key={t.value || "all"} value={t.value || "all"}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="w-full sm:w-auto"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="w-full sm:w-auto"
            />
            {(search || typeFilter || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setSearch(""); setTypeFilter(""); setDateFrom(""); setDateTo(""); setPage(1) }}
              >
                <Filter className="size-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Transactions ({total} total)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <History className="size-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No transactions found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {search || typeFilter || dateFrom || dateTo
                  ? "Try adjusting your filters."
                  : "Inventory transactions will appear here once stock operations begin."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right w-[100px]">Quantity</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="hidden md:table-cell">Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => {
                      const typeConfig = TYPE_CONFIG[tx.type] || TYPE_CONFIG.OPENING_STOCK
                      const qty = formatQuantity(tx.type, tx.quantity)
                      const TypeIcon = typeConfig.icon

                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(tx.date).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{tx.product?.name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">{tx.product?.code || tx.product?.sku}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`text-[10px] ${typeConfig.color}`}>
                              <TypeIcon className="size-3 mr-1" />
                              {typeConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-right font-mono font-medium ${qty.color}`}>
                            {qty.text}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {tx.reference || "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                            {tx.remarks || "—"}
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
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
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
