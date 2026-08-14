'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  PackageCheck,
  Plus,
  Search,
  Eye,
  Trash2,
  Loader2,
  X,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader } from '@/components/shared/page-header'
import { GoodsReceivedFormDialog } from '@/components/stock/goods-received-form-dialog'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface GoodsReceivedItem {
  id: string
  productId: string
  supplierId: string | null
  source: string | null
  purchaseReference: string | null
  invoiceNumber: string | null
  batchNumber: string | null
  warehouse: string | null
  quantity: number
  unitCost: number
  date: string
  receivedBy: string
  remarks: string | null
  createdAt: string
  product: { id: string; name: string; code: string; unit: string }
  supplier: { id: string; name: string } | null
  receivedByUser: { id: string; name: string }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function isWithin24Hours(dateStr: string) {
  const created = new Date(dateStr)
  const now = new Date()
  return (now.getTime() - created.getTime()) / (1000 * 60 * 60) <= 24
}

export function GoodsReceivedPage() {
  const user = useAuthStore((s) => s.user)
  const canReceive = user ? hasPermission(user.role, 'stock', 'receive') : false

  const [items, setItems] = useState<GoodsReceivedItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters & pagination
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<GoodsReceivedItem | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingItem, setDeletingItem] = useState<GoodsReceivedItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search) params.set('search', search)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await fetch(`/api/stock/received?${params}`)
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
  }, [page, limit, search, dateFrom, dateTo])

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
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  async function handleDelete() {
    if (!deletingItem) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/stock/received/${deletingItem.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Goods received record deleted')
        setDeleteOpen(false)
        setDeletingItem(null)
        fetchItems()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setDeleting(false)
    }
  }

  const hasFilters = search || dateFrom || dateTo
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goods Received"
        description="Track all incoming goods and deliveries"
        icon={PackageCheck}
      >
        {canReceive && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            Record Goods Received
          </Button>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by product, supplier, invoice, batch number..."
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
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-[150px]"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            placeholder="From"
          />
          <Input
            type="date"
            className="w-[150px]"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            placeholder="To"
          />
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
              <TableHead className="hidden sm:table-cell">Supplier</TableHead>
              <TableHead className="hidden md:table-cell">Invoice #</TableHead>
              <TableHead className="hidden lg:table-cell">Batch #</TableHead>
              <TableHead className="hidden lg:table-cell">Warehouse</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="hidden sm:table-cell text-right">Unit Cost</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
              <TableHead className="hidden xl:table-cell">Source</TableHead>
              <TableHead className="hidden xl:table-cell">Received By</TableHead>
              <TableHead className="w-[80px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 12 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12}>
                  <div className="flex flex-col items-center justify-center py-12">
                    <PackageCheck className="size-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium">No goods received yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {hasFilters
                        ? 'Try adjusting your search or filters.'
                        : canReceive
                          ? 'Click the button above to record your first goods received.'
                          : 'Goods received entries will appear here once recorded.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const canDeleteThis = canReceive && isWithin24Hours(item.createdAt)
                const totalItemCost = item.quantity * item.unitCost
                return (
                  <TableRow key={item.id} className="group">
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(item.date), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm max-w-[180px] truncate">{item.product.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.product.code}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">
                      {item.supplier?.name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm font-mono">
                      {item.invoiceNumber || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm font-mono">
                      {item.batchNumber || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">
                      {item.warehouse || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right text-sm">
                      {formatCurrency(item.unitCost)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      {formatCurrency(totalItemCost)}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {item.source ? (
                        <Badge variant="secondary" className="text-[10px]">{item.source}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-sm">
                      {item.receivedByUser.name}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => {
                            setDetailItem(item)
                            setDetailOpen(true)
                          }}
                        >
                          <Eye className="size-4" />
                          <span className="sr-only">View</span>
                        </Button>
                        {canDeleteThis && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-red-500 hover:text-red-600"
                            onClick={() => {
                              setDeletingItem(item)
                              setDeleteOpen(true)
                            }}
                          >
                            <Trash2 className="size-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
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
      <GoodsReceivedFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={fetchItems}
      />

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Goods Received Detail</DialogTitle>
            <DialogDescription>Full details of the goods received record.</DialogDescription>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Product</p>
                  <p className="font-medium">{detailItem.product.name}</p>
                  <p className="text-xs font-mono text-muted-foreground">{detailItem.product.code}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Supplier</p>
                  <p className="font-medium">{detailItem.supplier?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{format(new Date(detailItem.date), 'MMM dd, yyyy')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Received By</p>
                  <p className="font-medium">{detailItem.receivedByUser.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Invoice #</p>
                  <p className="font-medium font-mono">{detailItem.invoiceNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Batch #</p>
                  <p className="font-medium font-mono">{detailItem.batchNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Warehouse</p>
                  <p className="font-medium">{detailItem.warehouse || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Purchase Ref</p>
                  <p className="font-medium font-mono">{detailItem.purchaseReference || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Source</p>
                  <p className="font-medium">{detailItem.source || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Quantity</p>
                  <p className="font-medium">{detailItem.quantity} {detailItem.product.unit}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Unit Cost</p>
                  <p className="font-medium">{formatCurrency(detailItem.unitCost)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Cost</p>
                  <p className="font-bold text-primary">
                    {formatCurrency(detailItem.quantity * detailItem.unitCost)}
                  </p>
                </div>
              </div>
              {detailItem.remarks && (
                <div>
                  <p className="text-sm text-muted-foreground">Remarks</p>
                  <p className="text-sm mt-1">{detailItem.remarks}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Goods Received</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this goods received record for &ldquo;{deletingItem?.product.name}&rdquo;?
              This will reverse the stock transaction. This action can only be performed within 24 hours of creation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete Record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
