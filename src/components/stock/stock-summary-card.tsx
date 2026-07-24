'use client'

import { useEffect, useId, useState } from 'react'
import { format } from 'date-fns'
import {
  ArrowDownToLine,
  PackageCheck,
  ArrowUpFromLine,
  RotateCcw,
  Lock,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface StockSummary {
  openingStock: number
  totalReceived: number
  totalIssued: number
  totalReturned: number
  totalAdjustmentIn: number
  totalAdjustmentOut: number
  reservedStock: number
  available: number
}

interface RecentTransaction {
  id: string
  type: string
  quantity: number
  unitCost: number | null
  reference: string | null
  remarks: string | null
  date: string
}

interface StockSummaryData {
  summary: StockSummary | null
  transactions: RecentTransaction[]
  loaded: boolean
}

interface StockSummaryCardProps {
  productId: string
  compact?: boolean
}

const typeLabels: Record<string, string> = {
  OPENING_STOCK: 'Opening',
  GOODS_RECEIVED: 'Received',
  ISSUED: 'Issued',
  RETURNED: 'Returned',
  ADJUSTMENT_IN: 'Adj. In',
  ADJUSTMENT_OUT: 'Adj. Out',
}

const typeColors: Record<string, string> = {
  OPENING_STOCK: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  GOODS_RECEIVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  ISSUED: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  RETURNED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  ADJUSTMENT_IN: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  ADJUSTMENT_OUT: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

function getStockStatus(available: number): {
  label: string
  color: string
  bgColor: string
} {
  if (available <= 0) {
    return {
      label: 'Out of Stock',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-950/30',
    }
  }
  return {
    label: 'Healthy',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
  }
}

export function StockSummaryCard({ productId, compact = false }: StockSummaryCardProps) {
  const [data, setData] = useState<StockSummaryData>({ summary: null, transactions: [], loaded: false })

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    fetch(`/api/stock/summary?productId=${productId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setData({
            summary: d.summary || null,
            transactions: d.recentTransactions || [],
            loaded: true,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setData((prev) => ({ ...prev, loaded: true }))
      })
    return () => { cancelled = true }
  }, [productId])

  const { summary, transactions, loaded } = data

  if (!loaded) {
    return (
      <div className={compact ? '' : 'space-y-6'}>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: compact ? 4 : 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    )
  }

  if (!summary) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Unable to load stock summary.
        </CardContent>
      </Card>
    )
  }

  const status = getStockStatus(summary.available)

  if (compact) {
    return (
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Opening Stock</p>
          <p className="text-lg font-semibold mt-0.5">{summary.openingStock}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Total Received</p>
          <p className="text-lg font-semibold mt-0.5 text-emerald-600 dark:text-emerald-400">
            {summary.totalReceived}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${status.bgColor}`}>
          <p className="text-xs text-muted-foreground">Available Stock</p>
          <p className={`text-lg font-semibold mt-0.5 ${status.color}`}>
            {summary.available}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Reserved</p>
          <p className="text-lg font-semibold mt-0.5 text-amber-600 dark:text-amber-400">
            {summary.reservedStock}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="p-0 overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ArrowDownToLine className="size-3.5" />
              Opening Stock
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{summary.openingStock}</p>
          </CardContent>
        </Card>

        <Card className="p-0 overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <PackageCheck className="size-3.5" />
              Total Received
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {summary.totalReceived}
            </p>
          </CardContent>
        </Card>

        <Card className="p-0 overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ArrowUpFromLine className="size-3.5" />
              Issued
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {summary.totalIssued}
            </p>
          </CardContent>
        </Card>

        <Card className="p-0 overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <RotateCcw className="size-3.5" />
              Returned
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {summary.totalReturned}
            </p>
          </CardContent>
        </Card>

        <Card className={`p-0 overflow-hidden ${status.bgColor}`}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Lock className="size-3.5" />
              Reserved
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${status.color}`}>
              {summary.reservedStock}
            </p>
          </CardContent>
        </Card>

        <Card className="p-0 overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="size-3.5" />
              Available
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-2">
              <p className={`text-2xl font-bold ${status.color}`}>
                {summary.available}
              </p>
              <Badge variant="secondary" className={`text-[10px] ${status.bgColor} ${status.color} border-0`}>
                {status.label}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Reference</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.slice(0, 5).map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(tx.date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${typeColors[tx.type] || ''}`}
                        >
                          {typeLabels[tx.type] || tx.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        {tx.type === 'ISSUED' || tx.type === 'ADJUSTMENT_OUT' ? '-' : '+'}
                        {tx.quantity}
                      </TableCell>
                      <TableCell className="text-xs hidden sm:table-cell font-mono">
                        {tx.reference || '—'}
                      </TableCell>
                      <TableCell className="text-xs hidden md:table-cell text-muted-foreground max-w-[200px] truncate">
                        {tx.remarks || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
