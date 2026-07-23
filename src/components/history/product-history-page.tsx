'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Timer,
  Search,
  Package,
  ArrowRightLeft,
  Circle,
  CheckCircle2,
  PackageOpen,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCcw,
  PlusCircle,
  MinusCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'

interface ProductOption {
  id: string
  name: string
  sku: string
}

interface TimelineEntry {
  id: string
  type: string
  quantity: number
  unitCost: number | null
  reference: string | null
  remarks: string | null
  date: string
  createdAt: string
  runningBalance: number
}

interface ProductInfo {
  id: string
  name: string
  sku: string
  code: string
  unit: string
  status: string
  minimumStock: number
}

const TX_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; isIn: boolean }> = {
  OPENING_STOCK: { label: 'Opening Stock', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: PackageOpen, isIn: true },
  GOODS_RECEIVED: { label: 'Goods Received', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: ArrowDownToLine, isIn: true },
  ISSUED: { label: 'Issued', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: ArrowUpFromLine, isIn: false },
  RETURNED: { label: 'Returned', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: RotateCcw, isIn: true },
  ADJUSTMENT_IN: { label: 'Adjustment In', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: PlusCircle, isIn: true },
  ADJUSTMENT_OUT: { label: 'Adjustment Out', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: MinusCircle, isIn: false },
}

export function ProductHistoryPage() {
  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const [product, setProduct] = useState<ProductInfo | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [currentBalance, setCurrentBalance] = useState(0)
  const [availableBalance, setAvailableBalance] = useState(0)
  const [totalReserved, setTotalReserved] = useState(0)
  const [loading, setLoading] = useState(false)

  const filteredProducts = useMemo(() => {
    if (!searchInput) return products
    const q = searchInput.toLowerCase()
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
  }, [searchInput, products])

  useEffect(() => {
    fetch('/api/products?limit=200&status=ACTIVE')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.data || []).map((p: { id: string; name: string; sku: string }) => ({ id: p.id, name: p.name, sku: p.sku }))
        setProducts(list)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    const controller = new AbortController()

    const loadTimeline = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/inventory/history/product/${selectedId}`, { signal: controller.signal })
        const d = await res.json()
        if (!cancelled) {
          setProduct(d.product)
          setTimeline(d.timeline || [])
          setCurrentBalance(d.currentBalance || 0)
          setAvailableBalance(d.availableBalance || 0)
          setTotalReserved(d.totalReserved || 0)
        }
      } catch {
        // ignore abort/network errors
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadTimeline()
    return () => { cancelled = true; controller.abort() }
  }, [selectedId])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product History"
        description="View transaction timeline and running balance for a product"
        icon={Timer}
      />

      {/* Product Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a product to view its history..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <Package className="size-3.5 text-muted-foreground" />
                        <span className="truncate">{p.name}</span>
                        <span className="text-muted-foreground font-mono text-[10px]">({p.sku})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Filter products..."
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedId && (
        <>
          {loading ? (
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : product ? (
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <Card className="p-0 overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Package className="size-3.5 text-primary" />
                    Product
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="font-semibold text-sm truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{product.code} · {product.sku}</p>
                </CardContent>
              </Card>
              <Card className="p-0 overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    Current Balance
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{currentBalance}</p>
                  <p className="text-xs text-muted-foreground">{product.unit}</p>
                </CardContent>
              </Card>
              <Card className="p-0 overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Package className="size-3.5 text-sky-600 dark:text-sky-400" />
                    Available
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{availableBalance}</p>
                  <p className="text-xs text-muted-foreground">{totalReserved > 0 ? `(${totalReserved} reserved)` : product.unit}</p>
                </CardContent>
              </Card>
              <Card className="p-0 overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <ArrowRightLeft className="size-3.5 text-muted-foreground" />
                    Total Transactions
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-2xl font-bold">{timeline.length}</p>
                  <p className="text-xs text-muted-foreground">all time</p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : timeline.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ArrowRightLeft className="size-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium">No transactions found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This product has no recorded inventory transactions yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="relative space-y-0">
              {timeline.map((entry, index) => {
                const config = TX_TYPE_CONFIG[entry.type] || { label: entry.type, color: '', icon: Circle, isIn: true }
                const IconComp = config.icon
                const isLast = index === timeline.length - 1

                return (
                  <div key={entry.id} className="relative flex gap-4 pb-6">
                    <div className="flex flex-col items-center">
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 ${
                        config.isIn
                          ? 'border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-950'
                          : 'border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950'
                      }`}>
                        <IconComp className={`size-4 ${config.isIn ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
                      </div>
                      {!isLast && (
                        <div className="w-px flex-1 bg-border mt-1" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 -mt-0.5">
                      <div className="rounded-lg border bg-card p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={`text-[10px] font-medium ${config.color}`}>
                                {config.label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(entry.date), 'MMM dd, yyyy')}
                              </span>
                            </div>
                            {entry.remarks && (
                              <p className="text-sm text-muted-foreground">{entry.remarks}</p>
                            )}
                            {entry.reference && (
                              <p className="text-xs text-muted-foreground font-mono">Ref: {entry.reference}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className={`text-lg font-bold ${config.isIn ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {config.isIn ? '+' : '−'}{entry.quantity}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{product?.unit || ''}</p>
                            </div>
                            <div className="w-px h-10 bg-border" />
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Balance</p>
                              <p className={`text-lg font-bold ${entry.runningBalance <= 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                                {entry.runningBalance}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {!selectedId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="size-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">Select a product</p>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a product from the dropdown above to view its complete transaction history and running balance.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
