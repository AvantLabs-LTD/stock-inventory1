'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Package,
  Plus,
  Upload,
  Download,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
  Trash2,
  Loader2,
  Filter,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { AddItemModal } from './add-item-modal'

// ─── Types ───────────────────────────────────────────────────────────────

interface InventoryItemData {
  id: string
  itemName: string
  specification: string
  unit: string
  quantity: number
  issuedQty: number
  reservedQty: number
  minimumStock: number
  unitCost: number
  warehouse: string
  status: string
  availableStock: number
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

// ─── Component ────────────────────────────────────────────────────────────

export function OpeningStockPageV2() {
  const { user } = useAuthStore()
  const role = user?.role || ''
  const canManage = hasPermission(role, 'stock', 'manage')
  const canView = hasPermission(role, 'stock', 'view')

  // Data state
  const [data, setData] = useState<InventoryItemData[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)

  // Filter state
  const [search, setSearch] = useState('')
  const [itemNameFilter, setItemNameFilter] = useState('all')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [stockFilter, setStockFilter] = useState('all')
  const [pageSize, setPageSize] = useState('50')

  // Dropdown options from API
  const [itemNames, setItemNames] = useState<string[]>([])
  const [warehouses, setWarehouses] = useState<string[]>([])

  // Modal state
  const [addItemOpen, setAddItemOpen] = useState(false)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<InventoryItemData | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Exporting state
  const [exporting, setExporting] = useState(false)

  // Import
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  // ─── Data Fetching ─────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!canView) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pagination.page))
      const limit = pageSize === 'all' ? 9999 : parseInt(pageSize, 10)
      params.set('limit', String(limit))
      if (search) params.set('search', search)
      if (itemNameFilter && itemNameFilter !== 'all') params.set('itemName', itemNameFilter)
      if (warehouseFilter && warehouseFilter !== 'all') params.set('warehouse', warehouseFilter)
      if (stockFilter && stockFilter !== 'all') params.set('stockFilter', stockFilter)

      const res = await fetch(`/api/inventory-items?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json.data || [])
        setPagination(json.pagination || { page: 1, limit, total: 0, totalPages: 0 })
        setItemNames(json.itemNames || [])
        setWarehouses(json.warehouses || [])
      } else {
        toast.error('Failed to load inventory data')
      }
    } catch {
      toast.error('Network error loading inventory')
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pageSize, search, itemNameFilter, warehouseFilter, stockFilter, canView])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset page when filters change
  useEffect(() => {
    setPagination((p) => ({ ...p, page: 1 }))
  }, [search, itemNameFilter, warehouseFilter, stockFilter, pageSize])

  // Computed ──────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/inventory-items/${deleteTarget.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(`${deleteTarget.itemName} - ${deleteTarget.specification} deleted`)
        setDeleteTarget(null)
        fetchData()
      } else {
        toast.error('Failed to delete item')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setDeleting(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (itemNameFilter && itemNameFilter !== 'all') params.set('itemName', itemNameFilter)
      if (warehouseFilter && warehouseFilter !== 'all') params.set('warehouse', warehouseFilter)
      if (stockFilter && stockFilter !== 'all') params.set('stockFilter', stockFilter)

      const res = await fetch(`/api/inventory-items/export?${params.toString()}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `inventory-stock-${new Date().toISOString().slice(0, 10)}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Export completed')
      } else {
        toast.error('Export failed')
      }
    } catch {
      toast.error('Export error')
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/inventory-items/import', { method: 'POST', body: form })
      if (res.ok) {
        const json = await res.json()
        toast.success(`Imported: ${json.imported}, Skipped: ${json.skipped}${json.errors?.length ? `, Errors: ${json.errors.length}` : ''}`)
        fetchData()
      } else {
        toast.error('Import failed')
      }
    } catch {
      toast.error('Import error')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  // ─── Computed ──────────────────────────────────────────────────────────

  const totalPages = pagination.totalPages

  const stockBadge = (item: InventoryItemData) => {
    if (item.quantity === 0) return <Badge variant="destructive">Out of Stock</Badge>
    if (item.minimumStock > 0 && item.quantity <= item.minimumStock)
      return <Badge className="bg-amber-500 text-white hover:bg-amber-600">Low Stock</Badge>
    if (item.reservedQty > 0)
      return <Badge className="bg-blue-500 text-white hover:bg-blue-600">Reserved</Badge>
    return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">In Stock</Badge>
  }

  const serialNo = (index: number) => (pagination.page - 1) * pagination.limit + index + 1

  // ─── Render ────────────────────────────────────────────────────────────

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Opening Stock"
        description="Live inventory register — automatically updated from all stock movements"
      />

      {/* ─── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by item name or specification..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManage && (
            <Button size="sm" onClick={() => setAddItemOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Item
            </Button>
          )}
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImport}
          />
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
            Export
          </Button>
        </div>
      </div>

      {/* ─── Filters ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span className="font-medium">Filters:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={itemNameFilter} onValueChange={setItemNameFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Item Name" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items</SelectItem>
              {itemNames.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Warehouse" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Warehouses</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w} value={w}>{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stockFilter} onValueChange={setStockFilter}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Stock Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="lowStock">Low Stock</SelectItem>
              <SelectItem value="outOfStock">Out of Stock</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
            </SelectContent>
          </Select>

          <Select value={pageSize} onValueChange={setPageSize}>
            <SelectTrigger className="w-[110px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 / page</SelectItem>
              <SelectItem value="50">50 / page</SelectItem>
              <SelectItem value="100">100 / page</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

          {(itemNameFilter !== 'all' || warehouseFilter !== 'all' || stockFilter !== 'all' || search) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setItemNameFilter('all')
                setWarehouseFilter('all')
                setStockFilter('all')
                setSearch('')
              }}
              className="h-9 text-xs"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* ─── Table ────────────────────────────────────────────────────── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-[calc(100vh-340px)] min-h-[300px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead className="w-[60px] text-center">S.No</TableHead>
                <TableHead className="min-w-[180px]">Item Name</TableHead>
                <TableHead className="min-w-[200px]">Specification</TableHead>
                <TableHead className="text-right min-w-[90px]">Inventory</TableHead>
                <TableHead className="text-right min-w-[90px]">Issued</TableHead>
                <TableHead className="text-right min-w-[120px]">Available Stock</TableHead>
                <TableHead className="text-right min-w-[120px]">Reserved Stock</TableHead>
                <TableHead className="w-[60px]">Status</TableHead>
                {canManage && <TableHead className="w-[50px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: canManage ? 8 : 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 8 : 7} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Package className="h-10 w-10" />
                      <p>No inventory items found</p>
                      {canManage && (
                        <Button variant="outline" size="sm" onClick={() => setAddItemOpen(true)}>
                          <Plus className="h-4 w-4 mr-1" /> Add Item
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item, idx) => (
                  <TableRow key={item.id} className="group">
                    <TableCell className="text-center text-muted-foreground text-sm">
                      {serialNo(idx)}
                    </TableCell>
                    <TableCell className="font-medium">{item.itemName}</TableCell>
                    <TableCell>
                      <span className="text-sm">{item.specification}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {item.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-orange-600">
                      {item.issuedQty > 0 ? item.issuedQty.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      <span className={item.availableStock <= 0 ? 'text-red-600' : item.availableStock <= item.minimumStock ? 'text-amber-600' : 'text-emerald-600'}>
                        {item.availableStock.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-blue-600">
                      {item.reservedQty > 0 ? item.reservedQty.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>{stockBadge(item)}</TableCell>
                    {canManage && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(item)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* ─── Pagination ─────────────────────────────────────────────── */}
        {pageSize !== 'all' && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <p className="text-sm text-muted-foreground">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} items
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((p) => ({ ...p, page: 1 }))}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 text-sm font-medium">
                {pagination.page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={pagination.page >= totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={pagination.page >= totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: totalPages }))}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Add Item Modal ──────────────────────────────────────────── */}
      <AddItemModal
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
        onSuccess={() => fetchData()}
      />

      {/* ─── Delete Confirmation ──────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>{deleteTarget?.itemName} — {deleteTarget?.specification}</strong>?{' '}
              This action can be undone later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
