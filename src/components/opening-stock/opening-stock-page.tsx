'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  Package,
  Layers,
  AlertTriangle,
  XCircle,
  Tags,
  CalendarClock,
  Plus,
  Upload,
  Download,
  FileDown,
  Settings2,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  ArchiveRestore,
  Trash2,
  MoreHorizontal,
  SlidersHorizontal,
  BookOpen,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { AddOpeningStockModal } from './add-opening-stock-modal'
import { SmartImportDialog } from './smart-import-dialog'
import { StockLedgerDrawer } from './stock-ledger-drawer'
import { ProjectConfigDialog } from './project-config-dialog'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductInfo {
  id: string
  name: string
  code: string
  sku: string
  unit: string
  status: string
  barcode: string | null
  brand: string | null
  size: string | null
  length: string | null
  color: string | null
  modelNumber: string | null
  minimumStock: number
  maximumStock: number
  reorderLevel: number
  parentProductId: string | null
  variantName: string | null
  category: { id: string; name: string; code: string } | null
  parent: { id: string; name: string; code: string } | null
}

interface ProjectQtyInfo {
  id: string
  productId: string
  projectFieldId: string
  requiredQty: number
  batchQty: number
  reservedQty: number
  consumedQty: number
  orderedQty: number
  toBeUsed: number
  remarks: string | null
  projectField: { id: string; name: string; code: string }
}

interface CustomValueInfo {
  id: string
  value: string
  customField: { id: string; name: string; fieldType: string }
}

interface OpeningStockEntry {
  id: string
  productId: string
  warehouse: string | null
  storageLocation: string | null
  quantity: number
  unitCost: number
  inventoryValue: number
  batchNumber: string | null
  serialNumber: string | null
  expiryDate: string | null
  purchaseReference: string | null
  invoiceNumber: string | null
  receivedDate: string | null
  openingDate: string
  remarks: string | null
  internalNotes: string | null
  importBatchId: string | null
  status: string
  deletedAt: string | null
  deletedBy: string | null
  createdById: string
  createdAt: string
  updatedAt: string
  lastTransactionAt: string | null
  receivedQty: number
  issuedQty: number
  returnedQty: number
  reservedQty: number
  damagedQty: number
  transferredInQty: number
  transferredOutQty: number
  currentStock: number
  availableStock: number
  stockStatus: string
  product: ProductInfo
  createdBy: { id: string; name: string; email: string }
  projectQtys: ProjectQtyInfo[]
  customValues: CustomValueInfo[]
}

interface SummaryData {
  totalProducts: number
  totalQuantity: number
  totalValue: number
  lowStockCount: number
  outOfStockCount: number
  criticalStockCount: number
  categoriesCount: number
  warehousesCount: number
  lastImportDate: string | null
}

interface CategoryItem {
  id: string
  name: string
  code: string
}

interface ProjectField {
  id: string
  name: string
  code: string
}

type ColumnKey =
  | 'product'
  | 'variant'
  | 'category'
  | 'specification'
  | 'unit'
  | 'warehouse'
  | 'openingQty'
  | 'received'
  | 'issued'
  | 'returned'
  | 'currentStock'
  | 'availableStock'
  | 'status'
  | 'actions'
  | 'sku'
  | 'barcode'
  | 'brand'
  | 'reserved'
  | 'damaged'
  | 'transferredIn'
  | 'transferredOut'
  | 'inventoryValue'
  | 'batch'
  | 'serial'
  | 'openingDate'
  | 'lastTransaction'
  | 'lastUpdated'
  | 'createdBy'
  | 'createdAt'
  | string

interface ColumnDef {
  key: ColumnKey
  label: string
  defaultVisible: boolean
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'product', label: 'Product Name', defaultVisible: true },
  { key: 'variant', label: 'Variant', defaultVisible: true },
  { key: 'category', label: 'Category', defaultVisible: true },
  { key: 'specification', label: 'Specification', defaultVisible: true },
  { key: 'unit', label: 'Unit', defaultVisible: true },
  { key: 'warehouse', label: 'Warehouse', defaultVisible: true },
  { key: 'openingQty', label: 'Opening Qty', defaultVisible: true },
  { key: 'received', label: 'Received', defaultVisible: true },
  { key: 'issued', label: 'Issued', defaultVisible: true },
  { key: 'returned', label: 'Returned', defaultVisible: true },
  { key: 'currentStock', label: 'Current Stock', defaultVisible: true },
  { key: 'availableStock', label: 'Available Stock', defaultVisible: true },
  { key: 'status', label: 'Status', defaultVisible: true },
  { key: 'actions', label: 'Actions', defaultVisible: true },
  { key: 'sku', label: 'SKU', defaultVisible: false },
  { key: 'barcode', label: 'Barcode', defaultVisible: false },
  { key: 'brand', label: 'Brand', defaultVisible: false },
  { key: 'reserved', label: 'Reserved', defaultVisible: false },
  { key: 'damaged', label: 'Damaged', defaultVisible: false },
  { key: 'transferredIn', label: 'Transferred In', defaultVisible: false },
  { key: 'transferredOut', label: 'Transferred Out', defaultVisible: false },
  { key: 'inventoryValue', label: 'Inventory Value', defaultVisible: false },
  { key: 'batch', label: 'Batch', defaultVisible: false },
  { key: 'serial', label: 'Serial', defaultVisible: false },
  { key: 'openingDate', label: 'Opening Date', defaultVisible: false },
  { key: 'lastTransaction', label: 'Last Transaction', defaultVisible: false },
  { key: 'lastUpdated', label: 'Last Updated', defaultVisible: false },
  { key: 'createdBy', label: 'Created By', defaultVisible: false },
  { key: 'createdAt', label: 'Created', defaultVisible: false },
]

const WAREHOUSES = [
  { value: 'Main Warehouse', label: 'Main Warehouse' },
  { value: 'Raw Material', label: 'Raw Material' },
  { value: 'SMD Line', label: 'SMD Line' },
  { value: 'Stores', label: 'Stores' },
]

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DELETED', label: 'Deleted' },
]

const STOCK_STATUS_OPTIONS = [
  { value: '', label: 'All Stock Status' },
  { value: 'HEALTHY', label: 'Healthy' },
  { value: 'LOW', label: 'Low Stock' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'OUT_OF_STOCK', label: 'Out of Stock' },
]

const PAGE_SIZE = 25

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US').format(n)
}

function StockStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'HEALTHY':
      return (
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          Healthy
        </Badge>
      )
    case 'LOW':
      return (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          Low Stock
        </Badge>
      )
    case 'CRITICAL':
      return (
        <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400">
          Critical
        </Badge>
      )
    case 'OUT_OF_STOCK':
      return (
        <Badge variant="outline" className="border-gray-500/30 bg-gray-500/10 text-gray-700 dark:text-gray-400">
          Out of Stock
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function ProductAvatar({ name }: { name: string }) {
  const initial = name ? name.charAt(0).toUpperCase() : '?'
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
      {initial}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function OpeningStockPageV2() {
  const user = useAuthStore((s) => s.user)
  const canManage = user ? hasPermission(user.role, 'stock', 'manage') : false
  const canView = user ? hasPermission(user.role, 'stock', 'view') : false

  // ─── Data State ──────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<OpeningStockEntry[]>([])
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [projectFields, setProjectFields] = useState<ProjectField[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)

  // ─── Filter State ───────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [status, setStatus] = useState('ACTIVE')
  const [stockStatus, setStockStatus] = useState('')
  const [projectId, setProjectId] = useState('')
  const [sortBy, setSortBy] = useState('openingDate')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  // ─── Column Visibility ─────────────────────────────────────────────────
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(DEFAULT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  )

  // ─── Selection ───────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ─── Dialogs ────────────────────────────────────────────────────────────
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [projectConfigOpen, setProjectConfigOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [detailEntry, setDetailEntry] = useState<OpeningStockEntry | null>(null)
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [archiveId, setArchiveId] = useState<string | null>(null)
  const [restoreId, setRestoreId] = useState<string | null>(null)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)

  // ─── Ledger ─────────────────────────────────────────────────────────────
  const [ledgerDrawerOpen, setLedgerDrawerOpen] = useState(false)
  const [ledgerEntryId, setLedgerEntryId] = useState<string | null>(null)

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Count active filters ───────────────────────────────────────────────
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (search) count++
    if (categoryId) count++
    if (warehouse) count++
    if (status !== 'ACTIVE') count++
    if (stockStatus) count++
    if (projectId) count++
    return count
  }, [search, categoryId, warehouse, status, stockStatus, projectId])

  const resetFilters = useCallback(() => {
    setSearch('')
    setCategoryId('')
    setWarehouse('')
    setStatus('ACTIVE')
    setStockStatus('')
    setProjectId('')
    setPage(1)
  }, [])

  // ─── Fetch Data ─────────────────────────────────────────────────────────
  const fetchEntries = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sortBy,
        sortOrder,
      })
      if (search) params.set('search', search)
      if (categoryId) params.set('categoryId', categoryId)
      if (warehouse) params.set('warehouse', warehouse)
      if (status) params.set('status', status)
      if (stockStatus) params.set('stockStatus', stockStatus)

      const res = await fetch(`/api/opening-stock?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setEntries(json.data || [])
      setTotal(json.pagination?.total || 0)

      // Update project fields from response
      if (json.projectFields) {
        setProjectFields(json.projectFields)
      }
    } catch (err) {
      console.error('Fetch error:', err)
      toast.error('Failed to load inventory data')
    } finally {
      setLoading(false)
    }
  }, [page, search, categoryId, warehouse, status, stockStatus, sortBy, sortOrder, canView])

  const fetchSummary = useCallback(async () => {
    if (!canView) return
    setSummaryLoading(true)
    try {
      const res = await fetch('/api/opening-stock/summary')
      if (!res.ok) throw new Error('Failed to fetch summary')
      const json = await res.json()
      setSummary(json)
    } catch (err) {
      console.error('Summary error:', err)
    } finally {
      setSummaryLoading(false)
    }
  }, [canView])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories?limit=500')
      if (!res.ok) throw new Error('Failed to fetch categories')
      const json = await res.json()
      setCategories(json.data || [])
    } catch {
      // ignore
    }
  }, [])

  const fetchProjectFields = useCallback(async () => {
    try {
      const res = await fetch('/api/opening-stock/projects')
      if (!res.ok) throw new Error('Failed to fetch projects')
      const json = await res.json()
      setProjectFields(json.data || [])
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  useEffect(() => {
    fetchSummary()
    fetchCategories()
    fetchProjectFields()
  }, [fetchSummary, fetchCategories, fetchProjectFields])

  // ─── Debounced search ──────────────────────────────────────────────────
  const handleSearchChange = useCallback((val: string) => {
    setSearch(val)
    setPage(1)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      // fetchEntries will re-run via the search dependency change
    }, 300)
  }, [])

  // ─── Sort Handler ───────────────────────────────────────────────────────
  const handleSort = useCallback((field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
    setPage(1)
  }, [sortBy])

  // ─── Column Toggle ──────────────────────────────────────────────────────
  const toggleColumn = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  // ─── Select / Deselect All ─────────────────────────────────────────────
  const allSelected = entries.length > 0 && entries.every((e) => selectedIds.has(e.id))
  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(entries.map((e) => e.id)))
    }
  }, [allSelected, entries])

  const handleSelectRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ─── Actions ────────────────────────────────────────────────────────────
  const handleArchive = useCallback(async () => {
    if (!archiveId) return
    try {
      const res = await fetch(`/api/opening-stock/${archiveId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to archive')
      }
      toast.success('Entry archived successfully')
      fetchEntries()
      fetchSummary()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive')
    } finally {
      setArchiveDialogOpen(false)
      setArchiveId(null)
    }
  }, [archiveId, fetchEntries, fetchSummary])

  const handleRestore = useCallback(async () => {
    if (!restoreId) return
    try {
      const res = await fetch(`/api/opening-stock/${restoreId}/restore`, { method: 'PATCH' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to restore')
      }
      toast.success('Entry restored successfully')
      fetchEntries()
      fetchSummary()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore')
    } finally {
      setRestoreDialogOpen(false)
      setRestoreId(null)
    }
  }, [restoreId, fetchEntries, fetchSummary])

  const handleViewLedger = useCallback((entryId: string) => {
    setLedgerEntryId(entryId)
    setLedgerDrawerOpen(true)
  }, [])

  const handleViewDetail = useCallback((entry: OpeningStockEntry) => {
    setDetailEntry(entry)
    setDetailDialogOpen(true)
  }, [])

  const handleExport = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (warehouse) params.set('warehouse', warehouse)
      if (categoryId) params.set('categoryId', categoryId)
      if (status) params.set('status', status)
      if (stockStatus) params.set('stockStatus', stockStatus)

      const res = await fetch(`/api/opening-stock/export?${params}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Opening Stock Export - ${format(new Date(), 'yyyy-MM-dd')}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('Export completed')
    } catch {
      toast.error('Failed to export data')
    }
  }, [warehouse, categoryId, status, stockStatus])

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const res = await fetch('/api/opening-stock/template')
      if (!res.ok) throw new Error('Template download failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Opening Stock Template.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('Template downloaded')
    } catch {
      toast.error('Failed to download template')
    }
  }, [])

  // ─── Pagination ─────────────────────────────────────────────────────────
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const paginationRange = useMemo(() => {
    const pages: number[] = []
    const maxVisible = 5
    let start = Math.max(1, page - Math.floor(maxVisible / 2))
    const end = Math.min(totalPages, start + maxVisible - 1)
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1)
    }
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }, [page, totalPages])

  // ─── Dynamic project columns ───────────────────────────────────────────
  const visibleProjectColumns = useMemo(() => {
    return projectFields.filter((pf) => visibleColumns.has(`project_${pf.id}`))
  }, [projectFields, visibleColumns])

  // ─── Sort icon ──────────────────────────────────────────────────────────
  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/40" />
    return sortOrder === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3 text-foreground" />
      : <ArrowDown className="ml-1 h-3 w-3 text-foreground" />
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          icon={Package}
          title="Opening Stock"
          description="Live inventory register for all products"
        >
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <>
                <Button onClick={() => setAddModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Opening Stock
                </Button>
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Excel
                </Button>
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  <Download className="mr-2 h-4 w-4" />
                  Template
                </Button>
              </>
            )}
            <Button variant="outline" onClick={handleExport}>
              <FileDown className="mr-2 h-4 w-4" />
              Export
            </Button>
            {canManage && (
              <Button variant="outline" onClick={() => setProjectConfigOpen(true)}>
                <Settings2 className="mr-2 h-4 w-4" />
                Projects
              </Button>
            )}
          </div>
        </PageHeader>

        {/* ─── Summary Cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {summaryLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          ) : summary ? (
            <>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Package className="h-4 w-4" />
                    <span className="text-xs font-medium">Total Products</span>
                  </div>
                  <p className="text-2xl font-bold">{formatNumber(summary.totalProducts)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Layers className="h-4 w-4" />
                    <span className="text-xs font-medium">Total Quantity</span>
                  </div>
                  <p className="text-2xl font-bold">{formatNumber(summary.totalQuantity)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-amber-500 mb-1">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-xs font-medium">Low Stock</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatNumber(summary.lowStockCount)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-red-500 mb-1">
                    <XCircle className="h-4 w-4" />
                    <span className="text-xs font-medium">Out of Stock</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatNumber(summary.outOfStockCount)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Tags className="h-4 w-4" />
                    <span className="text-xs font-medium">Categories</span>
                  </div>
                  <p className="text-2xl font-bold">{formatNumber(summary.categoriesCount)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <CalendarClock className="h-4 w-4" />
                    <span className="text-xs font-medium">Last Import</span>
                  </div>
                  <p className="text-sm font-semibold">
                    {summary.lastImportDate
                      ? format(new Date(summary.lastImportDate), 'MMM d, yyyy')
                      : 'Never'}
                  </p>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        {/* ─── Filters Bar ────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative min-w-[240px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search products, SKU, barcode, category..."
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                />
                {search && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => handleSearchChange('')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Category */}
              <Select value={categoryId} onValueChange={(v) => { setCategoryId(v === '_all' ? '' : v); setPage(1) }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Warehouse */}
              <Select value={warehouse} onValueChange={(v) => { setWarehouse(v === '_all' ? '' : v); setPage(1) }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Warehouse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Warehouses</SelectItem>
                  {WAREHOUSES.map((w) => (
                    <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status */}
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Stock Status */}
              <Select value={stockStatus} onValueChange={(v) => { setStockStatus(v === '_all' ? '' : v); setPage(1) }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Stock Status" />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value === '' ? '_all' : o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Project Filter */}
              <Select value={projectId} onValueChange={(v) => { setProjectId(v === '_all' ? '' : v); setPage(1) }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Projects</SelectItem>
                  {projectFields.map((pf) => (
                    <SelectItem key={pf.id} value={pf.id}>{pf.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Reset */}
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Reset
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5 text-xs">
                    {activeFilterCount}
                  </Badge>
                </Button>
              )}

              {/* Columns Toggle */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                    Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="end">
                  <div className="space-y-1 max-h-[320px] overflow-y-auto">
                    <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Standard Columns</p>
                    {DEFAULT_COLUMNS.map((col) => (
                      <label
                        key={col.key}
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={visibleColumns.has(col.key)}
                          onCheckedChange={() => toggleColumn(col.key)}
                        />
                        {col.label}
                      </label>
                    ))}
                    {projectFields.length > 0 && (
                      <>
                        <Separator className="my-2" />
                        <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Project Columns</p>
                        {projectFields.map((pf) => (
                          <label
                            key={`project_${pf.id}`}
                            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={visibleColumns.has(`project_${pf.id}`)}
                              onCheckedChange={() => toggleColumn(`project_${pf.id}`)}
                            />
                            {pf.name}
                          </label>
                        ))}
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* ─── Data Table ───────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              <div className="min-w-[1200px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      {/* Product Name (sticky) */}
                      <TableHead
                        className="sticky left-0 z-10 min-w-[200px] bg-muted/40 cursor-pointer select-none"
                        onClick={() => handleSort('product.name')}
                      >
                        <div className="flex items-center">
                          Product Name <SortIcon field="product.name" />
                        </div>
                      </TableHead>
                      {visibleColumns.has('variant') && (
                        <TableHead className="min-w-[100px]">Variant</TableHead>
                      )}
                      {visibleColumns.has('category') && (
                        <TableHead className="min-w-[120px]">Category</TableHead>
                      )}
                      {visibleColumns.has('specification') && (
                        <TableHead className="min-w-[120px]">Specification</TableHead>
                      )}
                      {visibleColumns.has('unit') && (
                        <TableHead className="min-w-[60px]">Unit</TableHead>
                      )}
                      {visibleColumns.has('warehouse') && (
                        <TableHead className="min-w-[100px]">Warehouse</TableHead>
                      )}
                      {visibleColumns.has('sku') && (
                        <TableHead className="min-w-[120px]">SKU</TableHead>
                      )}
                      {visibleColumns.has('barcode') && (
                        <TableHead className="min-w-[120px]">Barcode</TableHead>
                      )}
                      {visibleColumns.has('brand') && (
                        <TableHead className="min-w-[100px]">Brand</TableHead>
                      )}
                      {visibleColumns.has('openingQty') && (
                        <TableHead className="min-w-[80px] text-right">
                          <div className="flex items-center justify-end cursor-pointer" onClick={() => handleSort('quantity')}>
                            Opening Qty <SortIcon field="quantity" />
                          </div>
                        </TableHead>
                      )}
                      {visibleColumns.has('received') && (
                        <TableHead className="min-w-[70px] text-right">Received</TableHead>
                      )}
                      {visibleColumns.has('issued') && (
                        <TableHead className="min-w-[70px] text-right">Issued</TableHead>
                      )}
                      {visibleColumns.has('returned') && (
                        <TableHead className="min-w-[70px] text-right">Returned</TableHead>
                      )}
                      {visibleColumns.has('reserved') && (
                        <TableHead className="min-w-[70px] text-right">Reserved</TableHead>
                      )}
                      {visibleColumns.has('damaged') && (
                        <TableHead className="min-w-[70px] text-right">Damaged</TableHead>
                      )}
                      {visibleColumns.has('transferredIn') && (
                        <TableHead className="min-w-[70px] text-right">Trans. In</TableHead>
                      )}
                      {visibleColumns.has('transferredOut') && (
                        <TableHead className="min-w-[70px] text-right">Trans. Out</TableHead>
                      )}
                      {visibleColumns.has('currentStock') && (
                        <TableHead className="min-w-[90px] text-right">
                          <div className="flex items-center justify-end cursor-pointer" onClick={() => handleSort('currentStock')}>
                            Current Stock <SortIcon field="currentStock" />
                          </div>
                        </TableHead>
                      )}
                      {visibleColumns.has('availableStock') && (
                        <TableHead className="min-w-[90px] text-right">
                          <div className="flex items-center justify-end cursor-pointer" onClick={() => handleSort('availableStock')}>
                            Available <SortIcon field="availableStock" />
                          </div>
                        </TableHead>
                      )}
                      {visibleColumns.has('inventoryValue') && (
                        <TableHead className="min-w-[100px] text-right">
                          <div className="flex items-center justify-end cursor-pointer" onClick={() => handleSort('inventoryValue')}>
                            Value <SortIcon field="inventoryValue" />
                          </div>
                        </TableHead>
                      )}
                      {visibleColumns.has('batch') && (
                        <TableHead className="min-w-[120px]">Batch</TableHead>
                      )}
                      {visibleColumns.has('serial') && (
                        <TableHead className="min-w-[120px]">Serial</TableHead>
                      )}
                      {/* Project columns */}
                      {visibleProjectColumns.map((pf) => (
                        <TableHead key={`project_${pf.id}`} className="min-w-[80px] text-right">
                          {pf.code || pf.name}
                        </TableHead>
                      ))}
                      {visibleColumns.has('openingDate') && (
                        <TableHead className="min-w-[100px]">
                          <div className="flex items-center cursor-pointer" onClick={() => handleSort('openingDate')}>
                            Opening Date <SortIcon field="openingDate" />
                          </div>
                        </TableHead>
                      )}
                      {visibleColumns.has('lastTransaction') && (
                        <TableHead className="min-w-[100px]">Last Txn</TableHead>
                      )}
                      {visibleColumns.has('lastUpdated') && (
                        <TableHead className="min-w-[100px]">
                          <div className="flex items-center cursor-pointer" onClick={() => handleSort('updatedAt')}>
                            Updated <SortIcon field="updatedAt" />
                          </div>
                        </TableHead>
                      )}
                      {visibleColumns.has('createdBy') && (
                        <TableHead className="min-w-[120px]">Created By</TableHead>
                      )}
                      {visibleColumns.has('createdAt') && (
                        <TableHead className="min-w-[100px]">Created</TableHead>
                      )}
                      {visibleColumns.has('status') && (
                        <TableHead className="min-w-[100px]">Status</TableHead>
                      )}
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-8 w-8 rounded-md" />
                              <Skeleton className="h-4 w-32" />
                            </div>
                          </TableCell>
                          {Array.from({ length: 6 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : entries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={30}>
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                              <Package className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold">No inventory records found</h3>
                            <p className="text-sm text-muted-foreground mt-1 mb-4">
                              {activeFilterCount > 0
                                ? 'Try adjusting your filters to see more results.'
                                : 'Add your first opening stock entry to get started.'}
                            </p>
                            {activeFilterCount === 0 && canManage && (
                              <Button onClick={() => setAddModalOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Opening Stock
                              </Button>
                            )}
                            {activeFilterCount > 0 && (
                              <Button variant="outline" onClick={resetFilters}>
                                Clear Filters
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      entries.map((entry) => {
                        const p = entry.product
                        const isDeleted = entry.status === 'DELETED'
                        const pfMap: Record<string, ProjectQtyInfo> = {}
                        for (const pq of entry.projectQtys) {
                          pfMap[pq.projectFieldId] = pq
                        }

                        return (
                          <TableRow key={entry.id} className={isDeleted ? 'opacity-60' : ''}>
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(entry.id)}
                                onCheckedChange={() => handleSelectRow(entry.id)}
                              />
                            </TableCell>
                            {/* Product Name (sticky) */}
                            <TableCell className="sticky left-0 z-10 bg-background">
                              <div className="flex items-center gap-2">
                                <ProductAvatar name={p.name} />
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{p.name}</p>
                                  <p className="text-xs text-muted-foreground">{p.code}</p>
                                </div>
                              </div>
                            </TableCell>
                            {visibleColumns.has('variant') && (
                              <TableCell>
                                {p.variantName ? (
                                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.variantName}</span>
                                ) : p.parentProductId ? (
                                  <span className="text-xs text-muted-foreground">{p.parent?.name}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            )}
                            {visibleColumns.has('category') && (
                              <TableCell>
                                {p.category ? (
                                  <span className="text-sm">{p.category.name}</span>
                                ) : '—'}
                              </TableCell>
                            )}
                            {visibleColumns.has('specification') && (
                              <TableCell>
                                <span className="text-sm">{p.modelNumber || p.sku || '—'}</span>
                              </TableCell>
                            )}
                            {visibleColumns.has('unit') && (
                              <TableCell>
                                <span className="text-sm">{p.unit || 'pcs'}</span>
                              </TableCell>
                            )}
                            {visibleColumns.has('warehouse') && (
                              <TableCell>
                                <span className="text-sm">{entry.warehouse || '—'}</span>
                              </TableCell>
                            )}
                            {visibleColumns.has('sku') && (
                              <TableCell>
                                <span className="text-xs font-mono">{p.sku}</span>
                              </TableCell>
                            )}
                            {visibleColumns.has('barcode') && (
                              <TableCell>
                                <span className="text-xs font-mono">{p.barcode || '—'}</span>
                              </TableCell>
                            )}
                            {visibleColumns.has('brand') && (
                              <TableCell>
                                <span className="text-sm">{p.brand || '—'}</span>
                              </TableCell>
                            )}
                            {visibleColumns.has('openingQty') && (
                              <TableCell className="text-right font-mono text-sm">
                                {formatNumber(entry.quantity)}
                              </TableCell>
                            )}
                            {visibleColumns.has('received') && (
                              <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                                {entry.receivedQty > 0 ? `+${formatNumber(entry.receivedQty)}` : '0'}
                              </TableCell>
                            )}
                            {visibleColumns.has('issued') && (
                              <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                                {entry.issuedQty > 0 ? `-${formatNumber(entry.issuedQty)}` : '0'}
                              </TableCell>
                            )}
                            {visibleColumns.has('returned') && (
                              <TableCell className="text-right font-mono text-sm text-blue-600 dark:text-blue-400">
                                {entry.returnedQty > 0 ? `+${formatNumber(entry.returnedQty)}` : '0'}
                              </TableCell>
                            )}
                            {visibleColumns.has('reserved') && (
                              <TableCell className="text-right font-mono text-sm text-amber-600 dark:text-amber-400">
                                {formatNumber(entry.reservedQty)}
                              </TableCell>
                            )}
                            {visibleColumns.has('damaged') && (
                              <TableCell className="text-right font-mono text-sm text-gray-500">
                                {formatNumber(entry.damagedQty)}
                              </TableCell>
                            )}
                            {visibleColumns.has('transferredIn') && (
                              <TableCell className="text-right font-mono text-sm">
                                {formatNumber(entry.transferredInQty)}
                              </TableCell>
                            )}
                            {visibleColumns.has('transferredOut') && (
                              <TableCell className="text-right font-mono text-sm">
                                {formatNumber(entry.transferredOutQty)}
                              </TableCell>
                            )}
                            {visibleColumns.has('currentStock') && (
                              <TableCell className={`text-right font-mono font-semibold ${
                                entry.currentStock <= 0 ? 'text-red-600 dark:text-red-400' :
                                entry.currentStock <= (p.minimumStock || 0) ? 'text-orange-600 dark:text-orange-400' :
                                'text-foreground'
                              }`}>
                                {formatNumber(entry.currentStock)}
                              </TableCell>
                            )}
                            {visibleColumns.has('availableStock') && (
                              <TableCell className="text-right font-mono font-semibold">
                                {formatNumber(entry.availableStock)}
                              </TableCell>
                            )}
                            {visibleColumns.has('inventoryValue') && (
                              <TableCell className="text-right text-sm">
                                {formatCurrency(entry.inventoryValue)}
                              </TableCell>
                            )}
                            {visibleColumns.has('batch') && (
                              <TableCell>
                                <span className="text-xs font-mono">{entry.batchNumber || '—'}</span>
                              </TableCell>
                            )}
                            {visibleColumns.has('serial') && (
                              <TableCell>
                                <span className="text-xs font-mono">{entry.serialNumber || '—'}</span>
                              </TableCell>
                            )}
                            {/* Project columns */}
                            {visibleProjectColumns.map((pf) => {
                              const pq = pfMap[pf.id]
                              return (
                                <TableCell key={`project_${pf.id}`} className="text-right font-mono text-sm">
                                  {pq ? formatNumber(pq.requiredQty) : '0'}
                                </TableCell>
                              )
                            })}
                            {visibleColumns.has('openingDate') && (
                              <TableCell className="text-sm">
                                {format(new Date(entry.openingDate), 'MMM d, yyyy')}
                              </TableCell>
                            )}
                            {visibleColumns.has('lastTransaction') && (
                              <TableCell className="text-sm text-muted-foreground">
                                {entry.lastTransactionAt
                                  ? format(new Date(entry.lastTransactionAt), 'MMM d, HH:mm')
                                  : '—'}
                              </TableCell>
                            )}
                            {visibleColumns.has('lastUpdated') && (
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(entry.updatedAt), 'MMM d, HH:mm')}
                              </TableCell>
                            )}
                            {visibleColumns.has('createdBy') && (
                              <TableCell className="text-sm">
                                {entry.createdBy?.name || '—'}
                              </TableCell>
                            )}
                            {visibleColumns.has('createdAt') && (
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(entry.createdAt), 'MMM d, yyyy')}
                              </TableCell>
                            )}
                            {visibleColumns.has('status') && (
                              <TableCell>
                                <StockStatusBadge status={entry.stockStatus} />
                              </TableCell>
                            )}
                            {/* Actions */}
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleViewLedger(entry.id)}>
                                    <BookOpen className="mr-2 h-4 w-4" />
                                    View Stock Ledger
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleViewDetail(entry)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                  </DropdownMenuItem>
                                  {canManage && !isDeleted && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-red-600 dark:text-red-400"
                                        onClick={() => {
                                          setArchiveId(entry.id)
                                          setArchiveDialogOpen(true)
                                        }}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Archive
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  {canManage && isDeleted && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setRestoreId(entry.id)
                                          setRestoreDialogOpen(true)
                                        }}
                                      >
                                        <ArchiveRestore className="mr-2 h-4 w-4" />
                                        Restore
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>

            {/* ─── Pagination ────────────────────────────────────────────── */}
            {total > 0 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {formatNumber(total)} records
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page <= 1}
                    onClick={() => setPage(1)}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {paginationRange.map((p) => (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 w-8"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages}
                    onClick={() => setPage(totalPages)}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Dialogs & Drawers ────────────────────────────────────────── */}
        {addModalOpen && (
          <AddOpeningStockModal
            open={addModalOpen}
            onOpenChange={setAddModalOpen}
            onSaved={() => { fetchEntries(); fetchSummary(); }}
            projectFields={projectFields}
          />
        )}

        {importDialogOpen && (
          <SmartImportDialog
            open={importDialogOpen}
            onOpenChange={setImportDialogOpen}
            onImportComplete={() => { fetchEntries(); fetchSummary(); }}
          />
        )}

        {projectConfigOpen && (
          <ProjectConfigDialog
            open={projectConfigOpen}
            onOpenChange={setProjectConfigOpen}
            onUpdated={() => fetchProjectFields()}
          />
        )}

        <StockLedgerDrawer
          open={ledgerDrawerOpen}
          onOpenChange={setLedgerDrawerOpen}
          entryId={ledgerEntryId}
        />

        {/* Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Opening Stock Details</DialogTitle>
              <DialogDescription>Complete information for this inventory entry</DialogDescription>
            </DialogHeader>
            {detailEntry && (
              <div className="space-y-4">
                {/* Product Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Product</p>
                    <p className="font-medium">{detailEntry.product.name}</p>
                    <p className="text-xs text-muted-foreground">{detailEntry.product.code} | {detailEntry.product.sku}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Category</p>
                    <p className="font-medium">{detailEntry.product.category?.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Warehouse</p>
                    <p className="font-medium">{detailEntry.warehouse || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Storage Location</p>
                    <p className="font-medium">{detailEntry.storageLocation || '—'}</p>
                  </div>
                </div>

                <Separator />

                {/* Stock Info */}
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Opening Qty', value: detailEntry.quantity },
                    { label: 'Current Stock', value: detailEntry.currentStock },
                    { label: 'Available', value: detailEntry.availableStock },
                    { label: 'Unit Cost', value: formatCurrency(detailEntry.unitCost), isText: true },
                    { label: 'Received', value: detailEntry.receivedQty },
                    { label: 'Issued', value: detailEntry.issuedQty },
                    { label: 'Returned', value: detailEntry.returnedQty },
                    { label: 'Reserved', value: detailEntry.reservedQty },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="font-semibold">
                        {(item as { isText: boolean }).isText ? item.value : formatNumber(item.value as number)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <StockStatusBadge status={detailEntry.stockStatus} />
                  <span className="text-sm text-muted-foreground">
                    Inventory Value: <strong>{formatCurrency(detailEntry.inventoryValue)}</strong>
                  </span>
                </div>

                <Separator />

                {/* Additional Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Batch / Serial</p>
                    <p>{detailEntry.batchNumber || '—'} / {detailEntry.serialNumber || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Opening Date</p>
                    <p>{format(new Date(detailEntry.openingDate), 'MMM d, yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created By</p>
                    <p>{detailEntry.createdBy?.name || '—'} on {format(new Date(detailEntry.createdAt), 'MMM d, yyyy')}</p>
                  </div>
                  {detailEntry.remarks && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Remarks</p>
                      <p>{detailEntry.remarks}</p>
                    </div>
                  )}
                  {detailEntry.internalNotes && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Internal Notes</p>
                      <p className="text-sm italic">{detailEntry.internalNotes}</p>
                    </div>
                  )}
                </div>

                {/* Project Quantities */}
                {detailEntry.projectQtys.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-semibold mb-2">Project Quantities</p>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Project</TableHead>
                              <TableHead className="text-right">Required</TableHead>
                              <TableHead className="text-right">Batch</TableHead>
                              <TableHead className="text-right">Reserved</TableHead>
                              <TableHead className="text-right">Consumed</TableHead>
                              <TableHead className="text-right">Ordered</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detailEntry.projectQtys.map((pq) => (
                              <TableRow key={pq.id}>
                                <TableCell className="font-medium">{pq.projectField.name}</TableCell>
                                <TableCell className="text-right font-mono">{pq.requiredQty}</TableCell>
                                <TableCell className="text-right font-mono">{pq.batchQty}</TableCell>
                                <TableCell className="text-right font-mono">{pq.reservedQty}</TableCell>
                                <TableCell className="text-right font-mono">{pq.consumedQty}</TableCell>
                                <TableCell className="text-right font-mono">{pq.orderedQty}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Archive Dialog */}
        <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive Entry</AlertDialogTitle>
              <AlertDialogDescription>
                This will soft-delete this inventory entry. It can be restored later. Are you sure?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleArchive} className="bg-red-600 hover:bg-red-700">
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Restore Dialog */}
        <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore Entry</AlertDialogTitle>
              <AlertDialogDescription>
                This will restore this archived inventory entry back to active status. Are you sure?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
