'use client'

import { useEffect, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, Minus, Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'

interface SpecData {
  id: string
  itemName: string
  specification: string
  unit: string
  quantity: number
  issuedQty: number
  reservedQty: number
  availableStock: number
  minimumStock: number
  unitCost: number
  warehouse: string
  remarks: string | null
}

const REASONS = [
  { value: 'Purchase', label: 'Purchase', icon: '📦' },
  { value: 'Manual Adjustment', label: 'Manual Adjustment', icon: '🔧' },
  { value: 'Damaged', label: 'Damaged', icon: '⚠️' },
  { value: 'Lost', label: 'Lost', icon: '❌' },
  { value: 'Found', label: 'Found', icon: '✅' },
  { value: 'Correction', label: 'Correction', icon: '📝' },
  { value: 'Goods Received', label: 'Goods Received', icon: '🚚' },
  { value: 'Issue', label: 'Issue', icon: '📤' },
  { value: 'Return', label: 'Return', icon: '📥' },
  { value: 'Stock Take', label: 'Stock Take', icon: '📊' },
  { value: 'Other', label: 'Other', icon: '📋' },
]

interface EditStockModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spec: SpecData | null
  onSuccess: () => void
}

export function EditStockModal({ open, onOpenChange, spec, onSuccess }: EditStockModalProps) {
  const [action, setAction] = useState<'ADD' | 'SUBTRACT'>('ADD')
  const [reason, setReason] = useState('')
  const [quantity, setQuantity] = useState('')
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [currentStock, setCurrentStock] = useState(0)

  // Reset when spec changes
  useEffect(() => {
    if (spec) {
      setAction('ADD')
      setReason('')
      setQuantity('')
      setRemarks(spec?.remarks || '')
      setCurrentStock(spec.quantity)
    }
  }, [spec])

  const newStock = action === 'ADD'
    ? currentStock + (parseInt(quantity) || 0)
    : Math.max(0, currentStock - (parseInt(quantity) || 0))

  const handleSubmit = async () => {
    if (!spec) return

    const qty = parseInt(quantity)
    if (!qty || qty <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    if (!reason) {
      toast.error('Please select a reason')
      return
    }

    if (action === 'SUBTRACT' && qty > currentStock) {
      toast.error(`Cannot subtract more than current stock (${currentStock})`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/inventory-items/${spec.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason,
          quantity: qty,
          remarks: remarks.trim() || undefined,
        }),
      })

      if (res.ok) {
        const json = await res.json()
        toast.success(`Stock ${action === 'ADD' ? 'increased' : 'decreased'} by ${qty}`)
        onOpenChange(false)
        onSuccess()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to adjust stock')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!spec) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg">✏️</span> Edit Stock
          </DialogTitle>
          <DialogDescription>
            {spec.itemName} — {spec.specification}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Current Stock Display */}
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Current Stock</span>
              <Badge variant="outline" className="text-xs">{spec.unit} · {spec.warehouse}</Badge>
            </div>
            <p className="text-3xl font-bold font-mono">{currentStock.toLocaleString()}</p>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span>Issued: <strong className="text-orange-600">{spec.issuedQty}</strong></span>
              <span>Reserved: <strong className="text-blue-600">{spec.reservedQty}</strong></span>
              <span>Available: <strong className="text-emerald-600">{spec.availableStock}</strong></span>
            </div>
          </div>

          {/* Action Toggle: Add / Subtract */}
          <div className="space-y-2">
            <Label>Adjustment Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={action === 'ADD' ? 'default' : 'outline'}
                className={action === 'ADD' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                onClick={() => setAction('ADD')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Stock (+)
              </Button>
              <Button
                type="button"
                variant={action === 'SUBTRACT' ? 'default' : 'outline'}
                className={action === 'SUBTRACT' ? 'bg-red-600 hover:bg-red-700' : ''}
                onClick={() => setAction('SUBTRACT')}
              >
                <Minus className="h-4 w-4 mr-2" />
                Subtract Stock (−)
              </Button>
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="adj-quantity">Quantity</Label>
            <Input
              id="adj-quantity"
              type="number"
              min="1"
              max={action === 'SUBTRACT' ? currentStock : undefined}
              placeholder="Enter quantity..."
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
            />
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    <span className="mr-2">{r.icon}</span>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Remarks */}
          <div className="space-y-2">
            <Label htmlFor="adj-remarks">Remarks</Label>
            <Textarea
              id="adj-remarks"
              placeholder="Optional notes about this adjustment..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
            />
          </div>

          {/* Preview */}
          {parseInt(quantity) > 0 && (
            <div className={
              `rounded-lg p-3 border ${action === 'ADD'
                ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
              }`
            }>
              <div className="flex items-center gap-2 text-sm">
                {action === 'ADD'
                  ? <TrendingUp className="h-4 w-4 text-emerald-600" />
                  : <TrendingDown className="h-4 w-4 text-red-600" />
                }
                <span className="font-medium">
                  {currentStock.toLocaleString()} → {newStock.toLocaleString()}
                </span>
                <Badge variant={action === 'ADD' ? 'default' : 'destructive'} className="ml-auto text-xs">
                  {action === 'ADD' ? '+' : '-'}{parseInt(quantity)}
                </Badge>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !quantity || !reason}
            className={action === 'ADD'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-red-600 hover:bg-red-700'
            }
          >
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {action === 'ADD' ? 'Add Stock' : 'Subtract Stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
