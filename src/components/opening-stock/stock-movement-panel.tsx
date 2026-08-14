'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Clock, User, ArrowUpCircle, ArrowDownCircle, RotateCcw, History, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'

interface Movement {
  id: string
  action: string
  reason: string
  quantity: number
  previousStock: number
  newStock: number
  remarks: string | null
  userName: string | null
  createdAt: string
}

interface StockMovementPanelProps {
  itemId: string | null
  itemName: string
  specification: string
  onClose: () => void
}

const ACTION_CONFIG: Record<string, { label: string; icon: typeof ArrowUpCircle; className: string }> = {
  ADD: { label: 'Add', icon: ArrowUpCircle, className: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
  SUBTRACT: { label: 'Subtract', icon: ArrowDownCircle, className: 'text-red-600 bg-red-50 dark:bg-red-950/30' },
  ISSUE: { label: 'Issued', icon: ArrowDownCircle, className: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30' },
  RETURN: { label: 'Returned', icon: RotateCcw, className: 'text-teal-600 bg-teal-50 dark:bg-teal-950/30' },
  RECEIVE: { label: 'Received', icon: ArrowUpCircle, className: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
  OPENING: { label: 'Opening', icon: ArrowUpCircle, className: 'text-slate-600 bg-slate-50 dark:bg-slate-950/30' },
  DAMAGED: { label: 'Damaged', icon: ArrowDownCircle, className: 'text-red-600 bg-red-50 dark:bg-red-950/30' },
  CORRECTION: { label: 'Correction', icon: RotateCcw, className: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
}

export function StockMovementPanel({ itemId, itemName, specification, onClose }: StockMovementPanelProps) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  const fetchMovements = useCallback(async () => {
    if (!itemId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/inventory-items/${itemId}/movements?limit=100`)
      if (res.ok) {
        const json = await res.json()
        setMovements(json.movements || [])
        setTotal(json.pagination?.total || 0)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [itemId])

  useEffect(() => {
    fetchMovements()
  }, [fetchMovements])

  if (!itemId) return null

  return (
    <div className="border-l bg-background w-full sm:w-[400px] flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="font-semibold text-sm">Stock Movement History</h3>
            <p className="text-xs text-muted-foreground">
              {itemName} → {specification}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Movement Count */}
      <div className="px-4 py-2 border-b bg-muted/30">
        <span className="text-xs text-muted-foreground">
          {total} movement{total !== 1 ? 's' : ''} recorded
        </span>
      </div>

      {/* Movements List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <History className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No movements recorded yet</p>
              <p className="text-xs">Stock adjustments will appear here</p>
            </div>
          ) : (
            movements.map((m) => {
              const config = ACTION_CONFIG[m.action] || ACTION_CONFIG.CORRECTION
              const Icon = config.icon
              const isIncrease = m.newStock >= m.previousStock

              return (
                <div key={m.id} className="rounded-lg border p-3 space-y-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-md ${config.className}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <span className="text-sm font-medium">{config.label}</span>
                        <span className="text-xs text-muted-foreground ml-1.5">{m.reason}</span>
                      </div>
                    </div>
                    <Badge
                      variant={isIncrease ? 'default' : 'destructive'}
                      className={`text-xs ${isIncrease ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-red-100 text-red-700 hover:bg-red-100'}`}
                    >
                      {isIncrease ? '+' : '-'}{m.quantity}
                    </Badge>
                  </div>

                  {/* Stock change */}
                  <div className="flex items-center gap-2 text-xs font-mono pl-8">
                    <span className="text-muted-foreground">{m.previousStock.toLocaleString()}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className={isIncrease ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                      {m.newStock.toLocaleString()}
                    </span>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground pl-8">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(m.createdAt)}
                    </span>
                    {m.userName && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {m.userName}
                      </span>
                    )}
                  </div>

                  {/* Remarks */}
                  {m.remarks && (
                    <p className="text-xs text-muted-foreground italic pl-8 truncate" title={m.remarks}>
                      &quot;{m.remarks}&quot;
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
