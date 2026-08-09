'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  PackageOpen,
  Layers,
  Tag,
  Loader2,
  Eye,
  Pencil,
  Trash2,
  MoreHorizontal,
  Package,
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
import { ProductFormDialog } from '@/components/products/product-form-dialog'
import { useAppStore } from '@/stores/app-store'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────────

interface VariantData {
  id: string
  name: string
  variantName: string | null
  sku: string
  unit: string
  minimumStock: number
  unitCost: number
  status: string
  size: string | null
}

interface ParentProduct {
  id: string
  code: string
  name: string
  sku: string
  unit: string
  minimumStock: number
  unitCost: number
  status: string
  categoryId: string | null
  category: { id: string; name: string; code: string } | null
  variantCount: number
  variants: VariantData[]
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface SummaryStats {
  parentProducts: number
  variants: number
  totalProducts: number
}

interface Category {
  id: string
  name: string
  code: string
}

// ─── Summary Cards ─────────────────────────────────────────────────────

function SummaryCards({ summary, loading }: { summary: SummaryStats | null; loading: boolean }) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    )
  }

  const cards = [
    { label: 'Item Groups', value: summary.parentProducts, icon: PackageOpen, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Specifications', value: summary.variants, icon: Layers, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Total Products', value: summary.totalProducts, icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className={`${c.bg} border-none shadow-sm`}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground truncate">{c.label}</span>
              <c.icon className={`h-3.5 w-3.5 ${c.color} opacity-60`} />
            </div>
            <p className={`text-lg font-bold ${c.color}`}>{c.value.toLocaleString()}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────────────────

export function ProductList() {
  const user = useAuthStore((s) => s.user)
  const navigate = useAppStore((s) => s.navigate)
  const role = user?.role || ''
  const canCreate = hasPermission(role, 'products', 'create')
  const canEdit = hasPermission(role, 'products', 'edit')
  const canDelete = hasPermission(role, 'products', 'delete')

  // Data state
  const [data, setData] = useState<ParentProduct[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [summary, setSummary] = useState<SummaryStats | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [pageSize, setPageSize] = useState('50')

  // Accordion
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ParentProduct | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState<ParentProduct | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ─── Data Fetching ───────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pagination.page))
      const limit = pageSize === 'all' ? 9999 : parseInt(pageSize, 10)
      params.set('limit', String(limit))
      if (search) params.set('search', search)
      if (categoryId && categoryId !== 'all') params.set('categoryId', categoryId)

      const res = await fetch(`/api/products?${params}`)
      if (res.ok) {
        const json = await res.json()
        setData(json.data || [])
        setPagination(json.pagination || { page: 1, limit, total: 0, totalPages: 0 })
        setSummary(json.summary || null)
        setCategories(json.categories || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pageSize, search, categoryId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setPagination((p) => ({ ...p, page: 1 }))
  }, [search, categoryId, pageSize])

  // ─── Accordion ──────────────────────────────────────────────────────

  const toggleItem = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpanded(new Set(data.map((p) => p.id)))
  const collapseAll = () => setExpanded(new Set())

  // ─── Actions ────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deletingProduct) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/products/${deletingProduct.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Product deleted successfully')
        setDeleteOpen(false)
        setDeletingProduct(null)
        fetchData()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to delete product')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setDeleting(false)
    }
  }

  function openEdit(product: ParentProduct) {
    setEditingProduct(product)
    setFormOpen(true)
  }

  function openCreate() {
    setEditingProduct(null)
    setFormOpen(true)
  }

  const totalPages = pagination.totalPages
  const hasFilters = search || (categoryId && categoryId !== 'all')

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        description="Master product catalog — synced with Opening Stock inventory"
        icon={PackageOpen}
      >
        {canCreate && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Add Product
          </Button>
        )}
      </PageHeader>

      {/* ─── Summary Cards ──────────────────────────────────────────────── */}
      <SummaryCards summary={summary} loading={loading} />

      {/* ─── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search product or specification..."
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
        </div>
      </div>

      {/* ─── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Tag className="h-4 w-4" />
          <span className="font-medium">Filter:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={categoryId || 'all'} onValueChange={setCategoryId}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
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
              onClick={() => { setCategoryId(''); setSearch('') }}
              className="h-9 text-xs"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* ─── Main Table ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="max-h-[calc(100vh-380px)] min-h-[300px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead className="w-[40px]" />
                <TableHead className="w-[50px] text-center">Sr.</TableHead>
                <TableHead className="min-w-[180px]">Product Name</TableHead>
                <TableHead className="hidden md:table-cell min-w-[140px]">Category</TableHead>
                <TableHead className="text-center min-w-[80px]">Specs</TableHead>
                <TableHead className="hidden sm:table-cell">Unit</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Unit Cost</TableHead>
                <TableHead className="hidden lg:table-cell text-center">Min Stock</TableHead>
                <TableHead className="w-[80px] text-center">Status</TableHead>
                {(canEdit || canDelete) && <TableHead className="w-[80px] text-center">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: canEdit || canDelete ? 10 : 9 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canEdit || canDelete ? 10 : 9} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <PackageOpen className="h-10 w-10" />
                      <p>No products found</p>
                      {canCreate && (
                        <Button variant="outline" size="sm" onClick={openCreate}>
                          <Plus className="h-4 w-4 mr-1" /> Add Product
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((product, idx) => {
                  const isExpanded = expanded.has(product.id)
                  const serialNo = (pagination.page - 1) * pagination.limit + idx + 1

                  return (
                    <>
                      {/* ── Parent Row ─────────────────────────────────── */}
                      <TableRow
                        key={product.id}
                        className={isExpanded ? 'bg-muted/40' : 'hover:bg-muted/30 cursor-pointer'}
                        onClick={() => toggleItem(product.id)}
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
                        <TableCell className="text-center text-xs text-muted-foreground font-mono">
                          {serialNo}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm">{product.name}</span>
                            <span className="text-[11px] text-muted-foreground font-mono">{product.code}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {product.category ? (
                            <Badge variant="outline" className="text-[10px]">
                              {product.category.name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                            {product.variantCount} spec{product.variantCount !== 1 ? 's' : ''}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {product.unit}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-right font-mono text-sm">
                          {product.unitCost > 0 ? product.unitCost.toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-center text-sm">
                          {product.minimumStock > 0 ? product.minimumStock : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0 h-5">
                            {product.status}
                          </Badge>
                        </TableCell>
                        {(canEdit || canDelete) && (
                          <TableCell>
                            <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover/row:opacity-100">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate('product-detail', product.id) }}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  {canEdit && (
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(product) }}>
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                  )}
                                  {canDelete && (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setDeletingProduct(product)
                                                setDeleteOpen(true)
                                              }}
                                            >
                                              <Trash2 className="h-4 w-4 mr-2" />
                                              Delete
                                            </DropdownMenuItem>
                                          )}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>

                              {/* ── Expanded Variant Rows ────────────────────── */}
                              {isExpanded &&
                                product.variants.map((variant) => (
                                  <TableRow
                                    key={variant.id}
                                    className="bg-slate-50/70 hover:bg-slate-100/80"
                                  >
                                    <TableCell className="pl-3" />
                                    <TableCell className="text-center text-xs text-muted-foreground font-mono" />
                                    <TableCell className="pl-8">
                                      <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground text-xs">↳</span>
                                        <div className="flex flex-col">
                                          <span className="text-sm">{variant.name}</span>
                                          <span className="text-[11px] text-muted-foreground font-mono">{variant.sku}</span>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell" />
                                    <TableCell className="text-center" />
                                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                      {variant.unit}
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell text-right font-mono text-sm">
                                      {variant.unitCost > 0 ? variant.unitCost.toLocaleString() : '—'}
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell text-center text-sm">
                                      {variant.minimumStock > 0 ? variant.minimumStock : '—'}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0 h-4">
                                        {variant.status}
                                      </Badge>
                                    </TableCell>
                                    {(canEdit || canDelete) && <TableCell />}
                                  </TableRow>
                                ))}
                            </>
                          )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ─── Pagination ─────────────────────────────────────────────────── */}
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

      {/* ─── Form Dialog ────────────────────────────────────────────────── */}
      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editingProduct}
        onSuccess={fetchData}
      />

      {/* ─── Delete Confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deletingProduct?.name}&rdquo; and all its {deletingProduct?.variantCount || 0} specification(s)?
              This will also remove the corresponding items from Opening Stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
