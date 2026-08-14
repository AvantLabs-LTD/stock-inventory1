'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const approveSchema = z.object({
  approvedQty: z.coerce.number().int().positive('Approved quantity must be at least 1'),
})

type ApproveFormValues = z.infer<typeof approveSchema>

interface RequestData {
  id: string
  quantity: number
  approvedQty: number
  productId: string
  product: { id: string; name: string; code: string; unit: string }
}

interface ApproveDialogProps {
  requestId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ApproveDialog({
  requestId,
  open,
  onOpenChange,
  onSuccess,
}: ApproveDialogProps) {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [requestData, setRequestData] = useState<RequestData | null>(null)
  const [availableStock, setAvailableStock] = useState<number | null>(null)

  const form = useForm<ApproveFormValues>({
    resolver: zodResolver(approveSchema),
    defaultValues: {
      approvedQty: 0,
    },
    mode: 'onChange',
  })

  useEffect(() => {
    if (!open || !requestId) {
      setRequestData(null)
      setAvailableStock(null)
      return
    }

    setLoading(true)
    Promise.all([
      fetch(`/api/requests/${requestId}`).then((r) => r.json()),
    ])
      .then(([reqData]) => {
        const req = reqData.data
        if (req) {
          setRequestData(req)
          form.setValue('approvedQty', req.quantity)
          // Fetch available stock for the product
          return fetch(`/api/stock/summary?productId=${req.productId}`)
            .then((r) => r.json())
            .then((stockData) => {
              setAvailableStock(stockData.summary?.available ?? 0)
            })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, requestId, form])

  async function onSubmit(values: ApproveFormValues) {
    if (!requestId) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/requests/${requestId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedQty: values.approvedQty }),
      })
      if (res.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        form.setError('approvedQty', { message: data.error || 'Failed to approve request' })
      }
    } catch {
      form.setError('approvedQty', { message: 'Network error. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const watchedApprovedQty = form.watch('approvedQty')
  const isPartial = requestData ? watchedApprovedQty < requestData.quantity : false
  const exceedsAvailable = availableStock !== null && watchedApprovedQty > availableStock
  const exceedsRequested = requestData ? watchedApprovedQty > requestData.quantity : false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="size-5 text-green-600" />
            Approve Request
          </DialogTitle>
          <DialogDescription>
            Set the approved quantity for this request. You can partially approve if needed.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : requestData ? (
          <div className="space-y-4">
            {/* Request info */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Product</p>
                  <p className="font-medium">{requestData.product.name}</p>
                  <p className="text-xs font-mono text-muted-foreground">{requestData.product.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Requested Quantity</p>
                  <p className="text-lg font-bold text-primary">
                    {requestData.quantity}
                    <span className="text-xs font-normal text-muted-foreground ml-1">{requestData.product.unit}</span>
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Available Stock</p>
                <div className="flex items-center gap-2">
                  <p className={`text-lg font-bold ${availableStock !== null && availableStock <= 0 ? 'text-red-500' : availableStock !== null && availableStock <= 5 ? 'text-amber-500' : 'text-green-600'}`}>
                    {availableStock !== null ? availableStock : '—'}
                    <span className="text-xs font-normal text-muted-foreground ml-1">{requestData.product.unit}</span>
                  </p>
                </div>
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="approvedQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Approved Quantity *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max={requestData.quantity}
                          {...field}
                          autoFocus
                        />
                      </FormControl>
                      <FormMessage />
                      {exceedsRequested && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="size-3" />
                          Cannot exceed requested quantity ({requestData.quantity})
                        </p>
                      )}
                      {exceedsAvailable && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <AlertTriangle className="size-3" />
                          Exceeds available stock ({availableStock})
                        </p>
                      )}
                      {isPartial && !exceedsRequested && !exceedsAvailable && (
                        <p className="text-xs text-blue-600">
                          Partial approval: {watchedApprovedQty} of {requestData.quantity} {requestData.product.unit}
                        </p>
                      )}
                    </FormItem>
                  )}
                />

                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || exceedsRequested || exceedsAvailable || watchedApprovedQty <= 0}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {isPartial ? 'Partially Approve' : 'Approve'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Request not found
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
