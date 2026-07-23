'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  SlidersHorizontal,
  Plus,
  Search,
  X,
  ShieldAlert,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import { AdjustmentFormDialog } from '@/components/adjustments/adjustment-form-dialog'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface AdjustmentItem {
  id: string
  productId: string
  adjustedBy: string
  type: string
  quantity: number
  reason: string | null
  remarks: string | null
  date: string
  createdAt: string
  product: { id: string; name: string; code: string; unit: string }
  adjustedByUser: { id: string; name: string }
}

export function AdjustmentsPage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user ? hasPermission(user.role, 'stock', 'manage') : false
  const canView = user ? hasPermission(user.role, 'stock', 'adjust') : false

  const [items, setItems] = useState<AdjustmentItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters & pagination
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  // Dialog
  const [formOpen, setFormOpen] = useState(false)

  const fetchItems = useCallback(async () => {
    if (!canView) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search) params.set('search', search)
      if (typeFilter) params.set('type', typeFilter)

      const res = await fetch(`/api/adjustments?${params}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.data || [])
        setTotal(data.pagination?.total || 0)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, typeFilter, canView])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  function handleSearch() {
    setSearch(searchInput)
    setPage(1)
  }

  function clearFilters() {
    setSearchInput('')
    setSearch('')
    setTypeFilter('')
    setPage(1)
  }

  const hasFilters = search || typeFilter
  const totalPages = Math.ceil(total / limit)

  // Access denied
  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Stock Adjustments"
          description="View and manage stock adjustments"
          icon={SlidersHorizontal}
        />
        <div className="flex flex-col items-center justify-center py-20">
          <ShieldAlert className="size-16 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium">Access Restricted</p>
          <p className="text-sm text-muted-foreground mt-1">
            You do not have permission to view stock adjustments.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Adjustments"
        description="View and manage stock level adjustments. All adjustments are permanently recorded for audit purposes."
        icon={SlidersHorizontal}
      >
        {canManage && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Adjustment
          </Button>
        )}
      </PageHeader>

      {/* Info Banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-sm">
        <p className="text-amber-800 dark:text-amber-200">
          <strong>Note:</strong> Stock adjustments create permanent audit trail records and cannot be deleted. Use with care.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by product, reason, adjusted by..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSearch}>
            Search
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === '__none__' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ADJUSTMENT_IN">Increase</SelectItem>
              <SelectItem value="ADJUSTMENT_OUT">Decrease</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="icon" className="size-8" onClick={clearFilters}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-center">Type</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="hidden sm:table-cell">Reason</TableHead>
              <TableHead className="hidden md:table-cell">Adjusted By</TableHead>
              <TableHead className="hidden lg:table-cell">Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-12">
                    <SlidersHorizontal className="size-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium">No adjustments recorded yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {hasFilters
                        ? 'Try adjusting your search or filters.'
                        : canManage
                          ? 'Click the button above to create your first adjustment.'
                          : 'Adjustments will appear here once created.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {format(new Date(item.date), 'MMM dd, yyyy')}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm max-w-[180px] truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.product.code}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={item.type === 'ADJUSTMENT_IN' ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      {item.type === 'ADJUSTMENT_IN' ? '+ In' : '- Out'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-semibold text-sm">
                    <span className={item.type === 'ADJUSTMENT_IN' ? 'text-green-600' : 'text-red-600'}>
                      {item.type === 'ADJUSTMENT_IN' ? '+' : '-'}{item.quantity}
                    </span>
                    <span className="text-xs text-muted-foreground ml-0.5">{item.product.unit}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm max-w-[200px]">
                    <p className="truncate">{item.reason || '—'}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {item.adjustedByUser.name}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm max-w-[180px]">
                    <p className="truncate text-muted-foreground">
                      {item.remarks || '—'}
                    </p>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {Math.min((page - 1) * limit + 1, total)} to {Math.min(page * limit, total)} of {total} results
          </p>
          <div className="flex items-center gap-2">
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? 'default' : 'outline'}
                    size="icon"
                    className="size-8"
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Form Dialog */}
      <AdjustmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => {
          fetchItems()
          toast.success('Stock adjustment created successfully')
        }}
      />
    </div>
  )
}
