'use client'

import { useEffect, useState } from 'react'
import {
  Package,
  TrendingUp,
  Lock,
  AlertTriangle,
  XCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface OverviewStats {
  totalProducts: number
  totalStock: number
  totalAvailable: number
  totalReserved: number
  totalIssued: number
  lowStockCount: number
  outOfStockCount: number
  todayReceived: number
  todayIssued: number
}

export function StockOverviewWidget() {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/stock/overview')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setStats(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }

  if (!stats) return null

  const cards = [
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: Package,
      color: 'text-primary',
    },
    {
      title: 'Available Stock',
      value: stats.totalAvailable,
      icon: TrendingUp,
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: 'Reserved',
      value: stats.totalReserved,
      icon: Lock,
      color: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Low Stock Alerts',
      value: stats.lowStockCount,
      icon: AlertTriangle,
      color: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Out of Stock',
      value: stats.outOfStockCount,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.title} className="p-0 overflow-hidden">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <card.icon className={`size-3.5 ${card.color}`} />
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 grid-cols-2">
        <Card className="p-0 overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ArrowDownToLine className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Today Received
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stats.todayReceived}
            </p>
          </CardContent>
        </Card>
        <Card className="p-0 overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ArrowUpFromLine className="size-3.5 text-orange-600 dark:text-orange-400" />
              Today Issued
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {stats.todayIssued}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
