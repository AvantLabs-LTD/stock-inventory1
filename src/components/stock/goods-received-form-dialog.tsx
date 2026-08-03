'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { Loader2, Eye } from 'lucide-react'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'

type Option = { id: string; name: string; code?: string }

const goodsReceivedSchema = z.object({
  productId: z.string().min(1, 'Please select a product'),
  supplierId: z.string().optional(),
  source: z.string().optional(),
  purchaseReference: z.string().optional(),
  invoiceNumber: z.string().optional(),
  batchNumber: z.string().optional(),
  warehouse: z.string().optional(),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  unitCost: z.coerce.number().min(0, 'Unit cost must be non-negative'),
  date: z.string().min(1, 'Please select a date'),
  remarks: z.string().optional(),
})

type GoodsReceivedFormValues = z.infer<typeof goodsReceivedSchema>

interface GoodsReceivedFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function GoodsReceivedFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: GoodsReceivedFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<Option[]>([])
  const [suppliers, setSuppliers] = useState<Option[]>([])
  const [currentStock, setCurrentStock] = useState<number | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [dateOpen, setDateOpen] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')

  const form = useForm<GoodsReceivedFormValues>({
    resolver: zodResolver(goodsReceivedSchema),
    defaultValues: {
      productId: '',
      supplierId: '',
      source: '',
      purchaseReference: '',
      invoiceNumber: '',
      batchNumber: '',
      warehouse: '',
      quantity: 1,
      unitCost: 0,
      date: today,
      remarks: '',
    },
  })

  useEffect(() => {
    if (open) {
      Promise.all([
        fetch('/api/products?limit=200&status=ACTIVE')
          .then((r) => r.json())
          .then((d) => setProducts((d.data || []).map((p: { id: string; name: string; code: string }) => ({ id: p.id, name: p.name, code: p.code })))),
        fetch('/api/suppliers?limit=200&status=ACTIVE')
          .then((r) => r.json())
          .then((d) => setSuppliers((d.data || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })))),
      ]).catch(() => {})

      form.reset({
        productId: '',
        supplierId: '',
        source: '',
        purchaseReference: '',
        invoiceNumber: '',
        batchNumber: '',
        warehouse: '',
        quantity: 1,
        unitCost: 0,
        date: today,
        remarks: '',
      })
      setCurrentStock(null)
    }
  }, [open, form, today])

  // Watch quantity and unitCost for total calculation
  const watchedQuantity = form.watch('quantity')
  const watchedUnitCost = form.watch('unitCost')
  const watchedProductId = form.watch('productId')

  const totalCost = (Number(watchedQuantity) || 0) * (Number(watchedUnitCost) || 0)

  // Fetch current stock when product changes
  useEffect(() => {
    if (!watchedProductId) {
      setCurrentStock(null)
      return
    }
    fetch(`/api/stock/summary?productId=${watchedProductId}`)
      .then((r) => r.json())
      .then((d) => setCurrentStock(d.summary?.available ?? 0))
      .catch(() => setCurrentStock(null))
  }, [watchedProductId])

  async function onSubmit(values: GoodsReceivedFormValues) {
    setLoading(true)
    try {
      const res = await fetch('/api/stock/received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (res.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        form.setError('root', { message: data.error || 'Failed to record goods received' })
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
      p.code?.toLowerCase().includes(productSearch.toLowerCase())
  )

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  )

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Goods Received</DialogTitle>
          <DialogDescription>
            Record incoming goods into inventory. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {form.formState.errors.root && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
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
                            {p.name} ({p.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select supplier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <div className="p-2 border-b">
                          <Input
                            placeholder="Search suppliers..."
                            value={supplierSearch}
                            onChange={(e) => setSupplierSearch(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <SelectItem value="none">None</SelectItem>
                        {filteredSuppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Taobao" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="purchaseReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase Reference</FormLabel>
                    <FormControl>
                      <Input placeholder="PO number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoiceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Number</FormLabel>
                    <FormControl>
                      <Input placeholder="INV-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="batchNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Batch Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. BN-2025-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="warehouse"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Warehouse</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Main Warehouse" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                name="unitCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Cost *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <Popover open={dateOpen} onOpenChange={setDateOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            {field.value ? format(new Date(field.value), 'MMM dd, yyyy') : 'Pick a date'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={(d) => {
                            if (d) {
                              field.onChange(format(d, 'yyyy-MM-dd'))
                              setDateOpen(false)
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Current Stock & Total Cost Display */}
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Current Stock</p>
                  <p className="text-sm font-semibold">
                    {currentStock !== null ? currentStock : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(totalCost)}
                  </p>
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional remarks about this receipt..."
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Record Goods Received
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
