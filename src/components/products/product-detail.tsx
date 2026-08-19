'use client'

import { ArrowLeft, Package, AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/stores/app-store'
import { StockSummaryCard } from '@/components/stock/stock-summary-card'

interface ProductDetailData {
  id: string
  code: string
  name: string
  sku: string
  size: string | null
  unit: string
  minimumStock: number
  unitCost: number
  status: string
  category: { id: string; name: string; code: string } | null
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  INACTIVE: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  DISCONTINUED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

export function ProductDetail() {
  const selectedProductId = useAppStore((s) => s.selectedProductId)
  const goBack = useAppStore((s) => s.goBack)
  const [product, setProduct] = useState<ProductDetailData | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchProduct = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/products/${id}`)
      if (res.ok) {
        const data = await res.json()
        setProduct(data)
      }
    } catch {
      setProduct(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const prevIdRef = useState(selectedProductId)
  useEffect(() => {
    if (selectedProductId !== prevIdRef[0]) {
      prevIdRef[1](selectedProductId)
      setProduct(null)
      if (selectedProductId) {
        setLoading(true)
        fetchProduct(selectedProductId)
      }
    }
  }, [selectedProductId, fetchProduct, prevIdRef])

  useEffect(() => {
    if (selectedProductId && !product && !loading) {
      setLoading(true)
      fetchProduct(selectedProductId)
    }
  }, [selectedProductId, fetchProduct])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="mr-2 size-4" />
          Back to Products
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="size-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">Product not found</p>
            <p className="text-sm text-muted-foreground mt-1">
              The product you are looking for does not exist.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="mr-2 size-4" />
          Back
        </Button>
      </div>

      {/* Title Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">{product.name}</h1>
            <Badge variant="secondary" className={statusColorMap[product.status] || ''}>
              {product.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {product.code} &middot; SKU: {product.sku}
          </p>
        </div>
        {product.minimumStock > 0 && (
          <Badge variant="outline" className="w-fit text-muted-foreground">
            <AlertTriangle className="mr-1 size-3" />
            Min Stock: {product.minimumStock} {product.unit}
          </Badge>
        )}
      </div>

      {/* Stock Summary */}
      {selectedProductId && (
        <StockSummaryCard productId={selectedProductId} compact />
      )}

      {/* Details Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Product Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow label="Category" value={product.category?.name || '—'} />
            <DetailRow label="Specification" value={product.size || '—'} />
            <DetailRow label="Unit" value={product.unit} />
            <DetailRow label="Unit Cost" value={`Rs. ${product.unitCost.toFixed(2)}`} />
            <DetailRow label="Minimum Stock" value={`${product.minimumStock} ${product.unit}`} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
