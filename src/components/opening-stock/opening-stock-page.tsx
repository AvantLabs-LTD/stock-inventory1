'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Package,
  Plus,
  Upload,
  Download,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  MoreHorizontal,
  Trash2,
  Loader2,
  Filter,
  Boxes,
  AlertTriangle,
  ArchiveX,
  Lock,
  TrendingUp,
} from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
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

interface SpecData {
  id: string
  specification: string
  unit: string
  quantity: number
  issuedQty: number
  reservedQty: number
  returnedQty: number
  damagedQty: number
  availableStock: number
  minimumStock: number
  unitCost: number
  warehouse: string
  status: string
  remarks: string | null
}

interface ItemGroup {
  itemName: string
  specCount: number
  totalInventory: number
  totalIssued: number
  totalAvailable: number
  totalReserved: number
  specs: SpecData[]
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface SummaryStats {
  totalItems: number
  totalSpecs: number
  totalInventory: number
  totalAvailable: number
  lowStockCount: number
  outOfStockCount: number
  reservedCount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function statusForGroup(group: ItemGroup): {
  label: string
  variant: 'destructive' | 'secondary' | 'outline'
  className: string
} {
  if (group.totalInventory === 0) {
    return { label: 'Out of Stock', variant: 'destructive', className: 'bg-red-100 text-red-700 border-red-200' }
  }
  const hasLow = group.specs.some((s) => s.minimumStock > 0 && s.quantity > 0 && s.quantity <= s.minimumStock)
  const hasReserved = group.totalReserved > 0
  if (hasLow) {
    return { label: 'Low Stock', variant: 'secondary', className: 'bg-amber-100 text-amber-700 border-amber-200' }
  }
  if (hasReserved) {
    return { label: 'Reserved', variant: 'secondary', className: 'bg-blue-100 text-blue-700 border-blue-200' }
  }
  return { label: 'In Stock', variant: 'secondary', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
}

function statusForSpec(spec: SpecData): {
  label: string
  className: string
} {
  if (spec.quantity === 0) return { label: 'Out', className: 'bg-red-100 text-red-700' }
  if (spec.minimumStock > 0 && spec.quantity > 0 && spec.quantity <= spec.minimumStock) {
    return { label: 'Low', className: 'bg-amber-100 text-amber-700' }
  }
  if (spec.reservedQty > 0) return { label: 'Reserved', className: 'bg-blue-100 text-blue-700' }
  return { label: 'OK', className: 'bg-emerald-100 text-emerald-700' }
}

function fmt(n: number): string {
  return n.toLocaleString()
}

// ─── Summary Cards ───────────────────────────────────────────────────────

function SummaryCards({ summary, loading }: { summary: SummaryStats | null; loading: boolean }) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    )
  }

  const cards = [
    { label: 'Item Groups', value: summary.totalItems, icon: Boxes, color: 'text-slate-600', bg: 'bg-slate-50' },
    { label: 'Specifications', value: summary.totalSpecs, icon: Package, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Total Inventory', value: summary.totalInventory, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Available', value: summary.totalAvailable, icon: Package, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Low Stock', value: summary.lowStockCount, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Out of Stock', value: summary.outOfStockCount, icon: ArchiveX, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Reserved', value: summary.reservedCount, icon: Lock, color: 'text-blue-600', bg: 'bg-blue-50' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className={`${c.bg} border-none shadow-sm`}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground truncate">{c.label}</span>
              <c.icon className={`h-3.5 w-3.5 ${c.color} opacity-60`} />
            </div>
            <p className={`text-lg font-bold ${c.color}`}>{fmt(c.value)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────

export function OpeningStockPageV2() {
  const { user } = useAuthStore()
  const role = user?.role || ''
  const canManage = hasPermission(role, 'stock', 'manage')
  const canView = hasPermission(role, 'stock', 'view')

  // Data state
  const [data, setData] = useState<ItemGroup[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [summary, setSummary] = useState<SummaryStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Filter state
  const [search, setSearch] = useState('')
  const [itemNameFilter, setItemNameFilter] = useState('all')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [stockFilter, setStockFilter] = useState('all')
  const [pageSize, setPageSize] = useState('50')

  // Dropdown options
  const [itemNames, setItemNames] = useState<string[]>([])
  const [warehouses, setWarehouses] = useState<string[]>([])

  // Accordion state
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  // Modal state
  const [addItemOpen, setAddItemOpen] = useState(false)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<SpecData | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Export / Import state
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

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
        setSummary(json.summary || null)
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

  // ─── Accordion Toggle ─────────────────────────────────────────────────

  const toggleItem = (itemName: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(itemName)) {
        next.delete(itemName)
      } else {
        next.add(itemName)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedItems(new Set(data.map((g) => g.itemName)))
  }

  const collapseAll = () => {
    setExpandedItems(new Set())
  }

  // ─── Actions ──────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/inventory-items/${deleteTarget.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(`Deleted: ${deleteTarget.specification}`)
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
        a.download = `inventory-register-${new Date().toISOString().slice(0, 10)}.xlsx`
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
        const msg = `Imported: ${json.imported}, Skipped: ${json.skipped}`
        toast.success(msg)
        if (json.warnings?.length > 0) {
          toast.info(`${json.warnings.length} row(s) had issues`, {
            description: json.warnings.slice(0, 3).map((w: { message: string }) => w.message).join('\n'),
          })
        }
        fetchData()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Import failed')
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
  const hasFilters = search || itemNameFilter !== 'all' || warehouseFilter !== 'all' || stockFilter !== 'all'

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
        description="Live inventory register — grouped by item with expandable specifications"
      />

      {/* ─── Summary Cards ──────────────────────────────────────────────── */}
      <SummaryCards summary={summary} loading={loading} />

      {/* ─── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search item name or specification..."
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
          <Button variant="ghost" size="sm" onClick={expandAll} className="h-8 text-xs">
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll} className="h-8 text-xs">
            Collapse All
          </Button>
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
            <SelectTrigger className="w-[140px] h-9">
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

          {hasFilters && (
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

      {/* ─── Accordion Table ───────────────────────────────────────────── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-[calc(100vh-380px)] min-h-[300px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead className="w-[40px]" />
                <TableHead className="min-w-[200px]">Item Name</TableHead>
                <TableHead className="text-right min-w-[90px]">Inventory</TableHead>
                <TableHead className="text-right min-w-[80px]">Issued</TableHead>
                <TableHead className="text-right min-w-[110px]">Available</TableHead>
                <TableHead className="text-right min-w-[100px]">Reserved</TableHead>
                <TableHead className="w-[100px] text-center">Status</TableHead>
                {canManage && <TableHead className="w-[50px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
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
                data.map((group, groupIdx) => {
                  const isExpanded = expandedItems.has(group.itemName)
                  const status = statusForGroup(group)
                  const serialNo = (pagination.page - 1) * pagination.limit + groupIdx + 1

                  return (
                    <>
                      {/* ── Parent Row ─────────────────────────────────────── */}
                      <TableRow
                        key={`parent-${group.itemName}`}
                        className={isExpanded ? 'bg-muted/40' : 'hover:bg-muted/30 cursor-pointer'}
                        onClick={() => toggleItem(group.itemName)}
                      >
                        <TableCell className="pl-3">
                          <div className="flex items-center justify-center w-5 h-5 rounded transition-transform">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="flex flex-col">
                              <span className="font-semibold text-sm">{group.itemName}</span>
                              <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0 h-4 font-normal">
                                {group.specCount} spec{group.specCount !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmt(group.totalInventory)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-orange-600">
                          {group.totalIssued > 0 ? fmt(group.totalIssued) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          <span className={
                            group.totalAvailable <= 0
                              ? 'text-red-600'
                              : group.totalAvailable <= group.totalInventory * 0.2
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                          }>
                            {fmt(group.totalAvailable)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-blue-600">
                          {group.totalReserved > 0 ? fmt(group.totalReserved) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={status.variant} className={`${status.className} text-[11px] px-2 py-0 h-5`}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <span className="text-xs text-muted-foreground font-mono w-6 inline-block text-center">
                              {serialNo}
                            </span>
                          </TableCell>
                        )}
                      </TableRow>

                      {/* ── Expanded Spec Rows ─────────────────────────────── */}
                      {isExpanded &&
                        group.specs.map((spec) => {
                          const specStatus = statusForSpec(spec)
                          return (
                            <TableRow
                              key={`spec-${spec.id}`}
                              className="bg-slate-50/70 hover:bg-slate-100/80 group/row"
                            >
                              <TableCell className="pl-3" />
                              <TableCell className="pl-8">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground text-xs">↳</span>
                                  <div className="flex flex-col">
                                    <span className="text-sm">{spec.specification}</span>
                                    <span className="text-[11px] text-muted-foreground">
                                      {spec.unit} · {spec.warehouse}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {fmt(spec.quantity)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-orange-600">
                                {spec.issuedQty > 0 ? fmt(spec.issuedQty) : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold">
                                <span className={
                                  spec.availableStock <= 0
                                    ? 'text-red-600'
                                    : spec.availableStock <= spec.minimumStock
                                      ? 'text-amber-600'
                                      : 'text-emerald-600'
                                }>
                                  {fmt(spec.availableStock)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-blue-600">
                                {spec.reservedQty > 0 ? fmt(spec.reservedQty) : '—'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge className={`${specStatus.className} text-[10px] px-1.5 py-0 h-4 font-medium`}>
                                  {specStatus.label}
                                </Badge>
                              </TableCell>
                              {canManage && (
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setDeleteTarget(spec)
                                        }}
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
                          )
                        })}
                    </>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ─── Pagination ─────────────────────────────────────────────── */}
        {pageSize !== 'all' && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <p className="text-sm text-muted-foreground">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} item groups
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: 1 }))}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 text-sm font-medium">
                {pagination.page} / {totalPages}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page >= totalPages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page >= totalPages} onClick={() => setPagination((p) => ({ ...p, page: totalPages }))}>
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
            <AlertDialogTitle>Delete Specification</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>{deleteTarget?.specification}</strong>? This action can be undone later.
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
