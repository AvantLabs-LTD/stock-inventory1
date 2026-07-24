'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Package, FolderKanban, Hash, AlignLeft, MessageSquare } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { Badge } from '@/components/ui/badge'

interface Project {
  id: string
  name: string
  code: string
  status: string
}

interface Product {
  id: string
  name: string
  code: string
  sku: string
  unit: string
  status: string
}

const reserveSchema = z.object({
  productId: z.string().min(1, 'Please select a product'),
  projectId: z.string().min(1, 'Please select a project'),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  reason: z.string().max(200).optional(),
  remarks: z.string().max(500).optional(),
})

type ReserveFormValues = z.infer<typeof reserveSchema>

interface ReserveFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ReserveFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: ReserveFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [availableStock, setAvailableStock] = useState<number | null>(null)
  const [stockLoading, setStockLoading] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [projectSearch, setProjectSearch] = useState('')

  const form = useForm<ReserveFormValues>({
    resolver: zodResolver(reserveSchema),
    defaultValues: {
      productId: '',
      projectId: '',
      quantity: 1,
      reason: '',
      remarks: '',
    },
    mode: 'onChange',
  })

  const watchedProductId = form.watch('productId')
  const watchedProjectId = form.watch('projectId')
  const watchedQuantity = form.watch('quantity')

  // Load data when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        productId: '',
        projectId: '',
        quantity: 1,
        reason: '',
        remarks: '',
      })
      setAvailableStock(null)
      setProductSearch('')
      setProjectSearch('')

      fetch('/api/projects?limit=200&status=ACTIVE')
        .then((r) => r.json())
        .then((d) => setProjects(d.data || []))
        .catch(() => {})

      fetch('/api/products?limit=200&status=ACTIVE')
        .then((r) => r.json())
        .then((d) => setProducts(d.data || []))
        .catch(() => {})
    }
  }, [open, form])

  // Fetch available stock when product changes
  useEffect(() => {
    if (!watchedProductId) {
      setAvailableStock(null)
      return
    }
    setStockLoading(true)
    fetch(`/api/stock/summary?productId=${watchedProductId}`)
      .then((r) => r.json())
      .then((d) => setAvailableStock(d.summary?.available ?? 0))
      .catch(() => setAvailableStock(null))
      .finally(() => setStockLoading(false))
  }, [watchedProductId])

  async function onSubmit(values: ReserveFormValues) {
    setLoading(true)
    try {
      const res = await fetch('/api/reserved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (res.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        form.setError('root', { message: data.error || 'Failed to create reservation' })
      }
    } catch {
      form.setError('root', { message: 'Network error. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase())
  )

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(projectSearch.toLowerCase())
  )

  const selectedProduct = products.find((p) => p.id === watchedProductId)
  const selectedProject = projects.find((p) => p.id === watchedProjectId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reserve Inventory</DialogTitle>
          <DialogDescription>
            Reserve stock for a project. Reserved stock will not be available for issue.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {form.formState.errors.root && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            {/* Product Select */}
            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Package className="size-3.5" />
                    Product *
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Search and select product" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-60">
                      <div className="p-2 border-b">
                        <Input
                          placeholder="Search by name, code, or SKU..."
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      {filteredProducts.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No products found
                        </div>
                      ) : (
                        filteredProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                              <span>{p.name}</span>
                              <Badge variant="secondary" className="text-[10px] ml-auto">{p.unit}</Badge>
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Available Stock Display */}
            {watchedProductId && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Available Stock</p>
                    {stockLoading ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Loader2 className="size-3 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Loading...</span>
                      </div>
                    ) : (
                      <p className={`text-lg font-bold ${availableStock !== null && availableStock <= 0 ? 'text-red-500' : availableStock !== null && availableStock <= 5 ? 'text-amber-500' : 'text-green-600'}`}>
                        {availableStock !== null ? availableStock : '—'}
                        <span className="text-xs font-normal text-muted-foreground ml-1">{selectedProduct?.unit || ''}</span>
                      </p>
                    )}
                  </div>
                  {selectedProduct && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Product</p>
                      <p className="text-sm font-medium">{selectedProduct.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{selectedProduct.code}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Project Select */}
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <FolderKanban className="size-3.5" />
                    Project *
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Search and select project" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-60">
                      <div className="p-2 border-b">
                        <Input
                          placeholder="Search projects..."
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      {filteredProjects.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No projects found
                        </div>
                      ) : (
                        filteredProjects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                              <span>{p.name}</span>
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Quantity */}
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Hash className="size-3.5" />
                    Quantity * ({selectedProduct?.unit || 'units'})
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max={availableStock ?? undefined}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  {availableStock !== null && watchedQuantity > availableStock && (
                    <p className="text-xs text-red-500">
                      ⚠ Quantity exceeds available stock ({availableStock} {selectedProduct?.unit})
                    </p>
                  )}
                </FormItem>
              )}
            />

            {/* Reason */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <AlignLeft className="size-3.5" />
                    Reason
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Upcoming project requirement"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Remarks */}
            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <MessageSquare className="size-3.5" />
                    Remarks
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Summary Preview */}
            {watchedProductId && watchedProjectId && watchedQuantity > 0 && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm space-y-1.5">
                <p className="font-medium">Reservation Summary</p>
                <p className="text-muted-foreground">
                  Reserve <span className="text-primary font-bold">{watchedQuantity}</span> {selectedProduct?.unit} of{' '}
                  <span className="font-medium">{selectedProduct?.name}</span>
                </p>
                <p className="text-muted-foreground">
                  For: <span className="font-medium">{selectedProject?.name}</span>
                </p>
                {availableStock !== null && watchedQuantity <= availableStock && (
                  <p className="text-muted-foreground">
                    Available after reservation:{' '}
                    <span className={`font-medium ${availableStock - watchedQuantity <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                      {availableStock - watchedQuantity} {selectedProduct?.unit}
                    </span>
                  </p>
                )}
              </div>
            )}

            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Reserve Stock
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
