'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Package,
  ArrowDown,
  ArrowUp,
  Minus,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id: string
  openingStockId: string
  transactionType: string
  quantity: number
  oldStock: number
  newStock: number
  userId: string
  projectId: string | null
  warehouse: string | null
  remarks: string | null
  referenceId: string | null
  createdAt: string
  user: {
    id: string
    name: string
    email: string
  }
}

interface StockLedgerDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entryId: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTransactionLabel(type: string): string {
  switch (type) {
    case 'OPENING': return 'Opening'
    case 'GOODS_RECEIVED': return 'Goods Received'
    case 'ISSUED': return 'Issued'
    case 'RETURNED': return 'Returned'
    case 'TRANSFER_IN': return 'Transfer In'
    case 'TRANSFER_OUT': return 'Transfer Out'
    case 'ADJUSTMENT_IN': return 'Adjustment In'
    case 'ADJUSTMENT_OUT': return 'Adjustment Out'
    case 'DAMAGED': return 'Damaged'
    case 'SCRAPPED': return 'Scrapped'
    case 'RESERVED': return 'Reserved'
    case 'RELEASED': return 'Released'
    default: return type.replace(/_/g, ' ')
  }
}

function getTransactionColor(type: string): string {
  switch (type) {
    case 'OPENING':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
    case 'GOODS_RECEIVED':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
    case 'ISSUED':
      return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30'
    case 'RETURNED':
      return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30'
    case 'TRANSFER_IN':
      return 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30'
    case 'TRANSFER_OUT':
      return 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500/30'
    case 'ADJUSTMENT_IN':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
    case 'ADJUSTMENT_OUT':
      return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30'
    case 'DAMAGED':
      return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/30'
    case 'SCRAPPED':
      return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30'
    case 'RESERVED':
      return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30'
    case 'RELEASED':
      return 'bg-lime-500/10 text-lime-700 dark:text-lime-400 border-lime-500/30'
    default:
      return 'bg-muted text-muted-foreground border-muted-foreground/30'
  }
}

function getQuantityIcon(type: string) {
  const isPositive = ['OPENING', 'GOODS_RECEIVED', 'RETURNED', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RELEASED'].includes(type)
  const isZero = type === 'RESERVED' || type === 'RELEASED'
  if (isZero) return <Minus className="h-3.5 w-3.5 text-amber-500" />
  return isPositive
    ? <ArrowDown className="h-3.5 w-3.5 text-emerald-500" />
    : <ArrowUp className="h-3.5 w-3.5 text-red-500" />
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function StockLedgerDrawer({
  open,
  onOpenChange,
  entryId,
}: StockLedgerDrawerProps) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 50

  const totalPages = Math.ceil(total / pageSize)

  const fetchLedger = useCallback(async () => {
    if (!entryId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      })
      const res = await fetch(`/api/opening-stock/${entryId}/ledger?${params}`)
      if (!res.ok) throw new Error('Failed to fetch ledger')
      const json = await res.json()
      setEntries(json.data || [])
      setTotal(json.pagination?.total || 0)
    } catch (err) {
      toast.error('Failed to load stock ledger')
    } finally {
      setLoading(false)
    }
  }, [entryId, page])

  useEffect(() => {
    if (open && entryId) {
      setPage(1)
      fetchLedger()
    }
  }, [open, entryId, fetchLedger])

  // Re-fetch when page changes
  useEffect(() => {
    if (open && entryId && page > 1) {
      fetchLedger()
    }
  }, [page])

  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      setEntries([])
      setTotal(0)
      setPage(1)
    }
    onOpenChange(open)
  }, [onOpenChange])

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Stock Ledger
          </SheetTitle>
          <SheetDescription>
            Complete transaction history for this inventory entry
          </SheetDescription>
        </SheetHeader>

        {/* Entry ID display */}
        {entryId && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>ID: {entryId.substring(0, 12)}...</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={fetchLedger}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        )}

        <Separator />

        {/* Ledger Timeline */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {loading ? (
              <div className="space-y-4 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                  <Package className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No ledger entries found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Transaction history will appear here
                </p>
              </div>
            ) : (
              <div className="relative px-4 py-2">
                {/* Timeline line */}
                <div className="absolute left-[27px] top-2 bottom-2 w-px bg-border" />

                <div className="space-y-4">
                  {entries.map((entry, idx) => (
                    <div key={entry.id} className="relative flex gap-4">
                      {/* Timeline dot */}
                      <div className="relative z-10 mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted-foreground/30">
                        <div className="h-1.5 w-1.5 rounded-full bg-background" />
                      </div>

                      {/* Entry Card */}
                      <div className={`flex-1 rounded-lg border p-3 transition-colors ${
                        idx === 0 ? 'bg-muted/30' : ''
                      }`}>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-xs ${getTransactionColor(entry.transactionType)}`}
                            >
                              {getTransactionLabel(entry.transactionType)}
                            </Badge>
                            {getQuantityIcon(entry.transactionType)}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(entry.createdAt), 'MMM d, HH:mm')}
                          </span>
                        </div>

                        {/* Stock Change */}
                        <div className="flex items-center gap-4 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Qty:</span>
                            <span className={`text-sm font-mono font-semibold ${
                              entry.quantity > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : entry.quantity < 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-foreground'
                            }`}>
                              {entry.quantity > 0 ? `+${entry.quantity}` : entry.quantity}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="font-mono">{entry.oldStock}</span>
                            <span>→</span>
                            <span className="font-mono font-semibold text-foreground">{entry.newStock}</span>
                          </div>
                        </div>

                        {/* User */}
                        <div className="text-xs text-muted-foreground">
                          <span>By: <span className="font-medium">{entry.user?.name || 'System'}</span></span>
                          {entry.warehouse && (
                            <span className="ml-3">WH: {entry.warehouse}</span>
                          )}
                        </div>

                        {/* Remarks */}
                        {entry.remarks && (
                          <p className="mt-1.5 text-xs italic text-muted-foreground">
                            &ldquo;{entry.remarks}&rdquo;
                          </p>
                        )}

                        {/* Reference */}
                        {entry.referenceId && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Ref: {entry.referenceId.substring(0, 12)}...
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div className="border-t px-4 py-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {total} entries
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                >
                  <ChevronsLeft className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-xs px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  <ChevronsRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
