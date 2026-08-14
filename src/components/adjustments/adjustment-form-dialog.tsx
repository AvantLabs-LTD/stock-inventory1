'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
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

interface Product {
  id: string
  name: string
  code: string
  sku: string
  unit: string
  status: string
}

const adjustmentSchema = z.object({
  productId: z.string().min(1, 'Please select a product'),
  type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'], {
    required_error: 'Please select adjustment type',
  }),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  reason: z.string().min(1, 'Please provide a reason').max(200),
  remarks: z.string().max(500).optional(),
})

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>

interface AdjustmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AdjustmentFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: AdjustmentFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')

  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      productId: '',
      type: 'ADJUSTMENT_IN',
      quantity: 1,
      reason: '',
      remarks: '',
    },
    mode: 'onChange',
  })

  const watchedProductId = form.watch('productId')
  const watchedType = form.watch('type')

  // Load products when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        productId: '',
        type: 'ADJUSTMENT_IN',
        quantity: 1,
        reason: '',
        remarks: '',
      })
      setProductSearch('')

      fetch('/api/products?limit=200&status=ACTIVE')
        .then((r) => r.json())
        .then((d) => setProducts(d.data || []))
        .catch(() => {})
    }
  }, [open, form])

  async function onSubmit(values: AdjustmentFormValues) {
    setLoading(true)
    try {
      const res = await fetch('/api/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (res.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        form.setError('root', { message: data.error || 'Failed to create adjustment' })
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

  const selectedProduct = products.find((p) => p.id === watchedProductId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Stock Adjustment</DialogTitle>
          <DialogDescription>
            Adjust stock levels. This creates a permanent audit trail record.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {form.formState.errors.root && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product *</FormLabel>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjustment Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ADJUSTMENT_IN">
                          <span className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-green-500" />
                            Increase Stock
                          </span>
                        </SelectItem>
                        <SelectItem value="ADJUSTMENT_OUT">
                          <span className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-red-500" />
                            Decrease Stock
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity * ({selectedProduct?.unit || 'units'})</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Found unrecorded stock, Damaged goods, Count correction" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional details about this adjustment..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Summary */}
            {selectedProduct && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <h4 className="font-medium mb-2">Adjustment Summary</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Product</p>
                    <p className="text-sm">{selectedProduct.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="text-sm">
                      <Badge
                        variant={watchedType === 'ADJUSTMENT_IN' ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {watchedType === 'ADJUSTMENT_IN' ? '+ Stock In' : '- Stock Out'}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className={`text-sm font-semibold ${watchedType === 'ADJUSTMENT_IN' ? 'text-green-600' : 'text-red-600'}`}>
                      {watchedType === 'ADJUSTMENT_IN' ? '+' : '-'}{form.getValues('quantity') || 0} {selectedProduct.unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reason</p>
                    <p className="text-sm truncate">{form.getValues('reason') || '—'}</p>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Create Adjustment
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
