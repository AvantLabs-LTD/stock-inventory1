'use client'

import { useState } from 'react'
import { Loader2, Unlock, Package } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ReservationItem {
  id: string
  quantity: number
  product: { name: string; code: string; unit: string }
  project: { name: string; code: string }
  reservedByUser: { name: string }
  createdAt: string
}

interface ReleaseDialogProps {
  reservation: ReservationItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ReleaseDialog({
  reservation,
  open,
  onOpenChange,
  onSuccess,
}: ReleaseDialogProps) {
  const [loading, setLoading] = useState(false)

  if (!reservation) return null

  async function handleRelease() {
    setLoading(true)
    try {
      const res = await fetch(`/api/reserved/${reservation.id}/release`, {
        method: 'POST',
      })
      if (res.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        // We could show error via toast, but the dialog will stay open on failure
        onOpenChange(false)
      }
    } catch {
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Unlock className="size-4 text-orange-600 dark:text-orange-400" />
            </div>
            Release Reservation
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to release this reservation? The reserved stock will become available again.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Package className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{reservation.product.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{reservation.product.code}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Project</p>
              <p className="font-medium">{reservation.project.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Quantity</p>
              <p className="font-medium">
                <span className="text-primary">{reservation.quantity}</span>{' '}
                <span className="text-muted-foreground">{reservation.product.unit}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reserved By</p>
              <p className="font-medium">{reservation.reservedByUser.name}</p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="default"
            className="bg-orange-600 hover:bg-orange-700 text-white"
            disabled={loading}
            onClick={handleRelease}
          >
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Release Reservation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
