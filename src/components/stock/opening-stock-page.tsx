'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Package,
  Pencil,
  Search,
  Trash2,
  Upload,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PageHeader } from '@/components/shared/page-header'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  code: string
  sku: string
  unit: string
  status: string
  image: string | null
  category: { id: string; name: string; code: string } | null
  supplier: { id: string; name: string } | null
}

interface OpeningEntry {
  id: string
  productId: string
  type: string
  quantity: number
  remarks: string
  date: string
  createdAt: string
  product: Product
  openingQuantity: number
  currentTotalStock: number
  reservedQuantity: number
  issuedQuantity: number
  returnedQuantity: number
  availableQuantity: number
  toBeUsed: number
  totalBatch: number
  required: number
  ordered: number
  itemImage: string | null
}

interface Category {
  id: string
  name: string
  code: string
}

interface StockSummary {
  product: { id: string; name: string; code: string; unit: string; minimumStock: number }
  summary: {
    openingStock: number
    totalReceived: number
    totalIssued: number
    totalReturned: number
    totalAdjustmentIn: number
    totalAdjustmentOut: number
    reservedStock: number
    available: number
  }
  recentTransactions: {
    id: string
    type: string
    quantity: number
    unitCost: number | null
    reference: string | null
    remarks: string | null
    date: string
  }[]
}

interface ImportResult {
  success: boolean
  message: string
  imported: number
  updated: number
  skipped: number
  errors: string[]
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const openingSchema = z.object({
  productId: z.string().min(1, 'Please select a product'),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  remarks: z.string().optional(),
})

type OpeningFormValues = z.infer<typeof openingSchema>

const editSchema = z.object({
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  remarks: z.string().optional(),
})

type EditFormValues = z.infer<typeof editSchema>

// ─── Helpers ────────────────────────────────────────────────────────────────

const TX_TYPE_LABELS: Record<string, string> = {
  OPENING_STOCK: 'Opening',
  GOODS_RECEIVED: 'Received',
  ISSUED: 'Issued',
  RETURNED: 'Returned',
  ADJUSTMENT_IN: 'Adj. In',
  ADJUSTMENT_OUT: 'Adj. Out',
}

const TX_TYPE_COLORS: Record<string, string> = {
  OPENING_STOCK: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  GOODS_RECEIVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  ISSUED: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  RETURNED: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  ADJUSTMENT_IN: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  ADJUSTMENT_OUT: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OpeningStockPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Permissions ─────────────────────────────────────────────────────────
  const canManage = user ? hasPermission(user.role, 'stock', 'manage') : false
  const canView = user ? hasPermission(user.role, 'stock', 'view') : false

  // ─── Data state ─────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<OpeningEntry[]>([])
  const [totalEntries, setTotalEntries] = useState(0)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [exporting, setExporting] = useState(false)

  // ─── Search & filter state ──────────────────────────────────────────────
  const [tableSearch, setTableSearch] = useState('')
  const [tableSearchInput, setTableSearchInput] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  // ─── Dialog state ───────────────────────────────────────────────────────
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<OpeningEntry | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteEntry, setDeleteEntry] = useState<OpeningEntry | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ─── Detail sheet state ────────────────────────────────────────────────
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [detailSummary, setDetailSummary] = useState<StockSummary | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // ─── Refs ───────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Forms ──────────────────────────────────────────────────────────────
  const form = useForm<OpeningFormValues>({
    resolver: zodResolver(openingSchema),
    defaultValues: {
      productId: '',
      quantity: 1,
      remarks: '',
    },
  })

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      quantity: 1,
      remarks: '',
    },
  })

  // ─── API calls ─────────────────────────────────────────────────────────

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products?limit=500&status=ACTIVE')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.data || [])
      }
    } catch {
      // ignore
    }
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories?limit=500')
      if (res.ok) {
        const data = await res.json()
        setCategories(data.data || [])
      }
    } catch {
      // ignore
    }
  }, [])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (tableSearch) params.set('search', tableSearch)
      if (categoryFilter) params.set('categoryId', categoryFilter)

      const res = await fetch(`/api/stock/opening?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.data || [])
        setTotalEntries(data.pagination?.total || 0)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, limit, tableSearch, categoryFilter])

  useEffect(() => {
    if (!canView) return
    fetchProducts()
    fetchCategories()
  }, [fetchProducts, fetchCategories, canView])

  useEffect(() => {
    if (!canView) return
    fetchEntries()
  }, [fetchEntries, canView])

  // ─── Set Opening Stock submit ────────────────────────────────────────────

  async function onSubmit(values: OpeningFormValues) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/stock/opening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (res.ok) {
        toast.success('Opening stock set successfully')
        form.reset({ productId: '', quantity: 1, remarks: '' })
        fetchEntries()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to set opening stock')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Export Excel ──────────────────────────────────────────────────────

  async function handleExportExcel() {
    setExporting(true)
    try {
      const res = await fetch('/api/stock/opening/export')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Export failed')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="?(.+?)"?$/)
      a.download = match ? decodeURIComponent(match[1]) : `Opening Stock - Electronic Connectors_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Excel file downloaded successfully')
    } catch {
      toast.error('Failed to export. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // ─── Import Excel ─────────────────────────────────────────────────────

  async function handleImportExcel() {
    if (!importFile) {
      toast.error('Please select a file first')
      return
    }
    setImporting(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', importFile)

      const res = await fetch('/api/stock/opening/import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (res.ok) {
        setImportResult(data)
        toast.success(data.message || 'Import completed')
        fetchEntries()
      } else {
        toast.error(data.error || 'Import failed')
        setImportResult({ success: false, message: data.error || 'Import failed', imported: 0, updated: 0, skipped: 0, errors: [] })
      }
    } catch {
      toast.error('Failed to import. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  function resetImportDialog() {
    setImportFile(null)
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Edit Opening Stock ─────────────────────────────────────────────────

  function openEditDialog(entry: OpeningEntry) {
    setEditEntry(entry)
    editForm.reset({ quantity: entry.quantity, remarks: entry.remarks || '' })
    setEditDialogOpen(true)
  }

  async function onEditSubmit(values: EditFormValues) {
    if (!editEntry) return
    setEditSubmitting(true)
    try {
      const res = await fetch(`/api/stock/opening/${editEntry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (res.ok) {
        toast.success('Opening stock updated successfully')
        setEditDialogOpen(false)
        fetchEntries()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to update')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setEditSubmitting(false)
    }
  }

  // ─── Delete Opening Stock ───────────────────────────────────────────────

  function openDeleteDialog(entry: OpeningEntry) {
    setDeleteEntry(entry)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!deleteEntry) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/stock/opening/${deleteEntry.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Opening stock entry deleted')
        setDeleteDialogOpen(false)
        fetchEntries()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  // ─── Detail Sheet ───────────────────────────────────────────────────────

  async function openDetail(entry: OpeningEntry) {
    setDetailProduct(entry.product)
    setDetailSummary(null)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/stock/summary?productId=${entry.productId}`)
      if (res.ok) {
        const data = await res.json()
        setDetailSummary(data)
      }
    } catch {
      // ignore
    } finally {
      setDetailLoading(false)
    }
  }

  // ─── Search & Filter ────────────────────────────────────────────────────

  function handleTableSearch() {
    setTableSearch(tableSearchInput)
    setPage(1)
  }

  function clearFilters() {
    setTableSearchInput('')
    setTableSearch('')
    setCategoryFilter('')
    setPage(1)
  }

  // ─── Computed ───────────────────────────────────────────────────────────

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase())
  )

  const totalPages = Math.ceil(totalEntries / limit)
  const hasFilters = tableSearch || categoryFilter

  // ─── No permission view ────────────────────────────────────────────────

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Opening Stock"
          description="Manage initial stock quantities and track all inventory movements"
          icon={ArrowDownToLine}
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="size-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">Access Denied</p>
            <p className="text-sm text-muted-foreground mt-1">
              You do not have permission to view opening stock data.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <PageHeader
        title="Opening Stock"
        description="Manage initial stock quantities and track all inventory movements"
        icon={ArrowDownToLine}
      >
        {canManage && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => { resetImportDialog(); setImportDialogOpen(true) }}>
                  <Upload className="size-4" />
                  Import from Excel
                </Button>
              </TooltipTrigger>
              <TooltipContent>Upload an Excel file to import opening stock data</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleExportExcel}
                disabled={exporting || loading}
              >
                {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Export to Excel
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download all opening stock data as Excel</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </PageHeader>

      {/* Set Opening Stock Form */}
      {canManage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Set Opening Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {form.formState.errors.root && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {form.formState.errors.root.message}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <FormField
                    control={form.control}
                    name="productId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product *</FormLabel>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="pl-9">
                                <SelectValue placeholder="Search & select product" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <div className="p-2 border-b">
                                <Input
                                  placeholder="Search products..."
                                  value={productSearch}
                                  onChange={(e) => setProductSearch(e.target.value)}
                                  className="h-8"
                                />
                              </div>
                              {filteredProducts.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  <span className="flex items-center gap-2">
                                    {p.name} ({p.code})
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity *</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="remarks"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Remarks</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional remarks" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Set Opening Stock
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Opening Stock Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Inventory Overview</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by product name, code, SKU..."
                className="pl-9"
                value={tableSearchInput}
                onChange={(e) => setTableSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTableSearch()}
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v === '__all__' ? '' : v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleTableSearch}>
              Search
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={clearFilters}>
                <X className="size-3.5" />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Main Table */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Product</TableHead>
                  <TableHead className="min-w-[100px] hidden lg:table-cell">Category</TableHead>
                  <TableHead className="min-w-[100px] hidden lg:table-cell">Specification</TableHead>
                  <TableHead className="min-w-[60px] hidden md:table-cell">Unit</TableHead>
                  <TableHead className="text-center min-w-[80px]">Opening Qty</TableHead>
                  <TableHead className="text-center min-w-[80px]">Current Stock</TableHead>
                  <TableHead className="text-center min-w-[70px] hidden xl:table-cell">Reserved</TableHead>
                  <TableHead className="text-center min-w-[70px] hidden xl:table-cell">Issued</TableHead>
                  <TableHead className="text-center min-w-[70px] hidden xl:table-cell">Returned</TableHead>
                  <TableHead className="text-center min-w-[80px]">Available</TableHead>
                  <TableHead className="text-center min-w-[80px] hidden lg:table-cell">To Be Used</TableHead>
                  <TableHead className="text-center min-w-[80px] hidden lg:table-cell">Required</TableHead>
                  <TableHead className="text-center min-w-[80px] hidden lg:table-cell">Ordered</TableHead>
                  <TableHead className="min-w-[120px] hidden xl:table-cell">Remarks</TableHead>
                  {canManage && (
                    <TableHead className="text-center min-w-[100px]">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: canManage ? 11 : 10 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManage ? 15 : 14}>
                      <div className="flex flex-col items-center justify-center py-12">
                        <ArrowDownToLine className="size-12 text-muted-foreground/50 mb-4" />
                        <p className="text-lg font-medium">No opening stock entries yet</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {canManage
                            ? 'Set opening stock for products using the form above, or import from Excel.'
                            : 'Opening stock entries will appear here once set by an admin.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => (
                    <TableRow key={entry.id}>
                      {/* Product */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {entry.product.image ? (
                            <img
                              src={entry.product.image}
                              alt={entry.product.name}
                              className="size-8 rounded border object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="size-8 rounded border bg-muted flex items-center justify-center flex-shrink-0">
                              <Package className="size-3.5 text-muted-foreground" />
                            </div>
                          )}
                          <button
                            className="text-left hover:underline font-medium text-sm cursor-pointer"
                            onClick={() => openDetail(entry)}
                          >
                            {entry.product.name}
                            <p className="text-xs text-muted-foreground font-mono">
                              {entry.product.code}
                            </p>
                          </button>
                        </div>
                      </TableCell>

                      {/* Category */}
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {entry.product.category?.name || '—'}
                      </TableCell>

                      {/* Specification */}
                      <TableCell className="hidden lg:table-cell text-sm font-mono text-muted-foreground">
                        {entry.product.sku}
                      </TableCell>

                      {/* Unit */}
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {entry.product.unit}
                      </TableCell>

                      {/* Opening Qty */}
                      <TableCell className="text-center font-bold text-sm">
                        {entry.openingQuantity}
                      </TableCell>

                      {/* Current Total Stock */}
                      <TableCell className="text-center">
                        <span
                          className={`font-bold text-sm ${
                            entry.currentTotalStock > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {entry.currentTotalStock}
                        </span>
                      </TableCell>

                      {/* Reserved */}
                      <TableCell className="text-center text-sm text-muted-foreground hidden xl:table-cell">
                        {entry.reservedQuantity}
                      </TableCell>

                      {/* Issued */}
                      <TableCell className="text-center text-sm text-muted-foreground hidden xl:table-cell">
                        {entry.issuedQuantity}
                      </TableCell>

                      {/* Returned */}
                      <TableCell className="text-center text-sm text-muted-foreground hidden xl:table-cell">
                        {entry.returnedQuantity}
                      </TableCell>

                      {/* Available */}
                      <TableCell className="text-center">
                        <span
                          className={`font-bold text-sm ${
                            entry.availableQuantity > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : entry.availableQuantity === 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {entry.availableQuantity}
                        </span>
                      </TableCell>

                      {/* To Be Used */}
                      <TableCell className="text-center text-sm font-medium hidden lg:table-cell">
                        {entry.toBeUsed}
                      </TableCell>

                      {/* Required */}
                      <TableCell className="text-center hidden lg:table-cell">
                        <span
                          className={`font-bold text-sm ${
                            entry.required < 0
                              ? 'text-red-600 dark:text-red-400'
                              : ''
                          }`}
                        >
                          {entry.required}
                        </span>
                      </TableCell>

                      {/* Ordered */}
                      <TableCell className="text-center text-sm text-muted-foreground hidden lg:table-cell">
                        {entry.ordered}
                      </TableCell>

                      {/* Remarks */}
                      <TableCell className="hidden xl:table-cell text-sm text-muted-foreground max-w-[150px] truncate">
                        {entry.remarks || '—'}
                      </TableCell>

                      {/* Actions */}
                      {canManage && (
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7"
                                    onClick={() => openEditDialog(entry)}
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-destructive hover:text-destructive"
                                    onClick={() => openDeleteDialog(entry)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {!loading && entries.length > 0 && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {Math.min((page - 1) * limit + 1, totalEntries)} to{' '}
                {Math.min(page * limit, totalEntries)} of {totalEntries} results
              </p>
              <div className="flex items-center gap-2">
                <Select
                  value={String(limit)}
                  onValueChange={(v) => {
                    setLimit(Number(v))
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
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
        </CardContent>
      </Card>

      {/* Products Status Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Products Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Total Items</span>
              <span className="text-xl font-bold">{products.length}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border p-3">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="size-3 text-emerald-500" />
                Opening Set
              </span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{totalEntries}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border p-3">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="size-3 rounded-full border-2 border-dashed border-muted-foreground/40" />
                Pending
              </span>
              <span className="text-xl font-bold">{Math.max(0, products.length - totalEntries)}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Total Stock Value</span>
              <span className="text-xl font-bold">
                {entries.length > 0
                  ? entries.reduce((sum, e) => sum + e.currentTotalStock, 0).toLocaleString()
                  : '0'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Import Excel Dialog ──────────────────────────────────────── */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) resetImportDialog() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5" />
              Import from Excel
            </DialogTitle>
            <DialogDescription>
              Upload an Excel file with opening stock data. Products will be auto-created if they don&apos;t exist.
            </DialogDescription>
          </DialogHeader>

          {!importResult ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <p className="text-sm font-medium">Template Format</p>
                <p className="text-xs text-muted-foreground">
                  Columns: <span className="font-mono font-medium">Name, Specification, Category, Unit, Quantity, Remarks</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Only <span className="font-mono">Name</span> and <span className="font-mono">Quantity</span> are required.
                </p>
              </div>

              <div className="space-y-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
                {importFile && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleImportExcel} disabled={importing || !importFile}>
                  {importing ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 size-4" />
                      Import
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-lg border p-4 ${importResult.success ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {importResult.success ? (
                    <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertCircle className="size-5 text-red-600 dark:text-red-400" />
                  )}
                  <p className="text-sm font-medium">{importResult.message}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{importResult.imported}</p>
                    <p className="text-xs text-muted-foreground">Imported</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{importResult.updated}</p>
                    <p className="text-xs text-muted-foreground">Updated</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{importResult.skipped}</p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:bg-red-900/20 dark:border-red-800">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Errors ({importResult.errors.length})</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {importResult.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-500 dark:text-red-400">{err}</p>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Edit Opening Stock Dialog ──────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5" />
              Edit Opening Stock
            </DialogTitle>
            <DialogDescription>
              {editEntry && `Update opening stock for ${editEntry.product.name} (${editEntry.product.code})`}
            </DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity *</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="remarks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Remarks</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional remarks" {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editSubmitting}>
                  {editSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ──────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" />
              Delete Opening Stock
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteEntry && (
                <>
                  Are you sure you want to delete the opening stock entry for{' '}
                  <span className="font-semibold">{deleteEntry.product.name}</span>? This action cannot be undone.
                  {deleteEntry.currentTotalStock !== deleteEntry.openingQuantity && (
                    <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">
                      Warning: This product has other stock transactions. Deletion may fail.
                    </span>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Item Detail Sheet ──────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Eye className="size-5" />
              Product Detail
            </SheetTitle>
            <SheetDescription>Stock information and recent transactions</SheetDescription>
          </SheetHeader>

          {detailProduct && (
            <div className="mt-6 space-y-6">
              {/* Product Info */}
              <div className="space-y-3">
                <div className="flex items-start gap-4">
                  {detailProduct.image ? (
                    <img
                      src={detailProduct.image}
                      alt={detailProduct.name}
                      className="size-20 rounded-lg border object-cover"
                    />
                  ) : (
                    <div className="size-20 rounded-lg border bg-muted flex items-center justify-center">
                      <Package className="size-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold">{detailProduct.name}</h3>
                    <p className="text-sm font-mono text-muted-foreground">{detailProduct.code}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {detailProduct.category && (
                        <Badge variant="secondary" className="text-[10px]">
                          {detailProduct.category.name}
                        </Badge>
                      )}
                      {detailProduct.supplier && (
                        <Badge variant="outline" className="text-[10px]">
                          {detailProduct.supplier.name}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {detailProduct.unit}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Product Details Grid */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between rounded border p-2">
                    <span className="text-muted-foreground">SKU</span>
                    <span className="font-mono">{detailProduct.sku}</span>
                  </div>
                  <div className="flex justify-between rounded border p-2">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant="secondary"
                      className={
                        detailProduct.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]'
                      }
                    >
                      {detailProduct.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Stock Breakdown */}
              {detailLoading ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Stock Breakdown</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 rounded-lg" />
                    ))}
                  </div>
                </div>
              ) : detailSummary ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Stock Breakdown</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border p-3 space-y-1">
                      <span className="text-xs text-muted-foreground">Opening Stock</span>
                      <p className="text-lg font-bold">{detailSummary.summary.openingStock}</p>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                      <span className="text-xs text-muted-foreground">Total Received</span>
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">+{detailSummary.summary.totalReceived}</p>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                      <span className="text-xs text-muted-foreground">Total Issued</span>
                      <p className="text-lg font-bold text-orange-600 dark:text-orange-400">-{detailSummary.summary.totalIssued}</p>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                      <span className="text-xs text-muted-foreground">Total Returned</span>
                      <p className="text-lg font-bold text-violet-600 dark:text-violet-400">+{detailSummary.summary.totalReturned}</p>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                      <span className="text-xs text-muted-foreground">Adjustments</span>
                      <p className="text-lg font-bold">
                        <span className="text-sky-600 dark:text-sky-400">+{detailSummary.summary.totalAdjustmentIn}</span>
                        {' / '}
                        <span className="text-red-600 dark:text-red-400">-{detailSummary.summary.totalAdjustmentOut}</span>
                      </p>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                      <span className="text-xs text-muted-foreground">Reserved</span>
                      <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{detailSummary.summary.reservedStock}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-1 text-center">
                    <span className="text-xs text-muted-foreground">Available Stock</span>
                    <p className={`text-2xl font-bold ${
                      detailSummary.summary.available > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : detailSummary.summary.available === 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                    }`}>
                      {detailSummary.summary.available} {detailProduct.unit}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Recent Transactions */}
              {detailSummary && detailSummary.recentTransactions.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Recent Transactions (Last 5)</p>
                  <div className="space-y-2">
                    {detailSummary.recentTransactions.slice(0, 5).map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between rounded border p-2.5 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${TX_TYPE_COLORS[tx.type] || ''}`}
                          >
                            {TX_TYPE_LABELS[tx.type] || tx.type}
                          </Badge>
                          {tx.remarks && (
                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {tx.remarks}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="font-medium">
                            {tx.type === 'ISSUED' || tx.type === 'ADJUSTMENT_OUT' ? '-' : '+'}{tx.quantity}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(tx.date), 'MMM dd')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailSummary && detailSummary.recentTransactions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Package className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No transactions yet</p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
