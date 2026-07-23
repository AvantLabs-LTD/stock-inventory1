'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import {
  ArrowDownToLine,
  CheckCircle2,
  Loader2,
  Search,
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
import { PageHeader } from '@/components/shared/page-header'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface Product {
  id: string
  name: string
  code: string
  sku: string
  unit: string
  status: string
}

interface OpeningEntry {
  id: string
  productId: string
  type: string
  quantity: number
  remarks: string | null
  date: string
  createdAt: string
  product: { id: string; name: string; code: string; sku: string; unit: string; status: string }
}

const openingSchema = z.object({
  productId: z.string().min(1, 'Please select a product'),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  remarks: z.string().optional(),
})

type OpeningFormValues = z.infer<typeof openingSchema>

export function OpeningStockPage() {
  const user = useAuthStore((s) => s.user)
  const [products, setProducts] = useState<Product[]>([])
  const [entries, setEntries] = useState<OpeningEntry[]>([])
  const [totalEntries, setTotalEntries] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [tableSearch, setTableSearch] = useState('')
  const [tableSearchInput, setTableSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  const canManage = user ? hasPermission(user.role, 'stock', 'manage') : false

  const form = useForm<OpeningFormValues>({
    resolver: zodResolver(openingSchema),
    defaultValues: {
      productId: '',
      quantity: 1,
      remarks: '',
    },
  })

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products?limit=200&status=ACTIVE')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.data || [])
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
  }, [page, limit, tableSearch])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

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

  function handleTableSearch() {
    setTableSearch(tableSearchInput)
    setPage(1)
  }

  function clearTableFilters() {
    setTableSearchInput('')
    setTableSearch('')
    setPage(1)
  }

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase())
  )

  const productsWithOpening = new Set(entries.map((e) => e.productId))
  const totalPages = Math.ceil(totalEntries / limit)
  const hasTableFilters = tableSearch

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opening Stock"
        description="Set initial stock quantities for products"
        icon={ArrowDownToLine}
      />

      {/* Set Opening Stock Form */}
      {canManage && (
        <Card>
          <CardHeader>
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
                              {filteredProducts.map((p) => {
                                const hasOpening = productsWithOpening.has(p.id)
                                return (
                                  <SelectItem key={p.id} value={p.id} disabled={hasOpening}>
                                    <span className="flex items-center gap-2">
                                      {p.name} ({p.code})
                                      {hasOpening && (
                                        <CheckCircle2 className="size-3 text-emerald-500" />
                                      )}
                                    </span>
                                  </SelectItem>
                                )
                              })}
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

      {/* Opening Stock Entries Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Opening Stock Entries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Table Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by product name or code..."
                className="pl-9"
                value={tableSearchInput}
                onChange={(e) => setTableSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTableSearch()}
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleTableSearch}>
              Search
            </Button>
            {hasTableFilters && (
              <Button variant="ghost" size="icon" className="size-8" onClick={clearTableFilters}>
                <X className="size-4" />
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="hidden md:table-cell">Remarks</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex flex-col items-center justify-center py-12">
                        <ArrowDownToLine className="size-12 text-muted-foreground/50 mb-4" />
                        <p className="text-lg font-medium">No opening stock entries yet</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {canManage
                            ? 'Set opening stock for products using the form above.'
                            : 'Opening stock entries will appear here once set by an admin.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.product.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {entry.product.code}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-semibold">
                        {entry.quantity} {entry.product.unit}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {format(new Date(entry.date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                        {entry.remarks || '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]"
                        >
                          Set
                        </Badge>
                      </TableCell>
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

      {/* Product Status Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Products Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Total Active:</span>
              <span className="font-semibold">{products.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" />
              <span className="text-muted-foreground">Opening Set:</span>
              <span className="font-semibold text-emerald-600">{totalEntries}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-4 rounded-full border-2 border-dashed border-muted-foreground/40" />
              <span className="text-muted-foreground">Pending:</span>
              <span className="font-semibold">{products.length - totalEntries}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
