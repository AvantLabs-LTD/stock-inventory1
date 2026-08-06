'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  PackageOpen,
  Loader2,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/shared/page-header'
import { ProductFormDialog } from '@/components/products/product-form-dialog'
import { useAppStore } from '@/stores/app-store'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface Product {
  id: string
  code: string
  name: string
  sku: string
  size: string | null
  unit: string
  minimumStock: number
  status: string
  category: { id: string; name: string; code: string } | null
}

interface Category {
  id: string
  name: string
  code: string
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  INACTIVE: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  DISCONTINUED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

type SortField = 'code' | 'name' | 'sku' | 'minimumStock' | 'status' | 'createdAt'
type SortOrder = 'asc' | 'desc'

export function ProductList() {
  const user = useAuthStore((s) => s.user)
  const navigate = useAppStore((s) => s.navigate)

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters & pagination
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('')
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: sortField,
        order: sortOrder,
      })
      if (search) params.set('search', search)
      if (categoryId) params.set('categoryId', categoryId)
      if (status) params.set('status', status)

      const res = await fetch(`/api/products?${params}`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data.data || [])
        setTotal(data.pagination?.total || 0)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, categoryId, status, sortField, sortOrder])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.data || []))
      .catch(() => {})
  }, [])

  function handleSearch() {
    setSearch(searchInput)
    setPage(1)
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
    setPage(1)
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronsUpDown className="ml-1 size-3 opacity-50" />
    return sortOrder === 'asc' ? (
      <ChevronUp className="ml-1 size-3" />
    ) : (
      <ChevronDown className="ml-1 size-3" />
    )
  }

  async function handleDelete() {
    if (!deletingProduct) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/products/${deletingProduct.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Product discontinued successfully')
        setDeleteOpen(false)
        setDeletingProduct(null)
        fetchProducts()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to discontinue product')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  function openEdit(product: Product) {
    setEditingProduct(product)
    setFormOpen(true)
  }

  function openCreate() {
    setEditingProduct(null)
    setFormOpen(true)
  }

  const totalPages = Math.ceil(total / limit)
  const canCreate = user ? hasPermission(user.role, 'products', 'create') : false
  const canEdit = user ? hasPermission(user.role, 'products', 'edit') : false
  const canDelete = user ? hasPermission(user.role, 'products', 'delete') : false

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Manage your parts & items catalog"
        icon={PackageOpen}
      >
        {canCreate && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Add Product
          </Button>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
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
          <Select value={categoryId} onValueChange={(v) => { setCategoryId(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[160px]">
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
          <Select value={status} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px] cursor-pointer select-none" onClick={() => handleSort('code')}>
                <span className="flex items-center">Code <SortIcon field="code" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('name')}>
                <span className="flex items-center">Name <SortIcon field="name" /></span>
              </TableHead>
              <TableHead className="hidden md:table-cell cursor-pointer select-none" onClick={() => handleSort('sku')}>
                <span className="flex items-center">SKU <SortIcon field="sku" /></span>
              </TableHead>
              <TableHead className="hidden sm:table-cell">Specs</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead className="hidden lg:table-cell">Unit</TableHead>
              <TableHead className="hidden lg:table-cell cursor-pointer select-none text-center" onClick={() => handleSort('minimumStock')}>
                <span className="flex items-center justify-center">Min Stock <SortIcon field="minimumStock" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('status')}>
                <span className="flex items-center">Status <SortIcon field="status" /></span>
              </TableHead>
              <TableHead className="w-[80px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <div className="flex flex-col items-center justify-center py-12">
                    <PackageOpen className="size-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium">No products found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search || categoryId || status
                        ? 'Try adjusting your search or filters.'
                        : 'Get started by adding your first product.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id} className="group">
                  <TableCell className="font-mono text-xs">{product.code}</TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">{product.name}</TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs">{product.sku}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">
                    {product.size ? (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {product.size}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {product.category ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {product.category.name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{product.unit}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-center">{product.minimumStock}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-[10px] ${statusColorMap[product.status] || ''}`}>
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <Eye className="size-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate('product-detail', product.id)}>
                          <Eye className="mr-2 size-4" />
                          View Details
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem onClick={() => openEdit(product)}>
                            <Pencil className="mr-2 size-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {canDelete && product.status !== 'DISCONTINUED' && (
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 dark:text-red-400"
                            onClick={() => {
                              setDeletingProduct(product)
                              setDeleteOpen(true)
                            }}
                          >
                            <Trash2 className="mr-2 size-4" />
                            Discontinue
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && products.length > 0 && (
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
      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editingProduct}
        onSuccess={fetchProducts}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discontinue Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to discontinue &ldquo;{deletingProduct?.name}&rdquo;? This will set the
              product status to Discontinued.
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
              Discontinue Product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
