'use client'

import { useCallback, useEffect, useState } from 'react'
import { Search, BarChart3, RefreshCw, Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { StockSummaryCard } from '@/components/stock/stock-summary-card'

interface Product {
  id: string
  name: string
  code: string
  sku: string
  unit: string
  status: string
}

export function StockSummaryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [productsLoading, setProductsLoading] = useState(true)

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true)
    try {
      const res = await fetch('/api/products?limit=200&status=ACTIVE')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.data || [])
      }
    } catch {
      // ignore
    } finally {
      setProductsLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Summary"
        description="View inventory levels and transaction history for any product"
        icon={BarChart3}
      >
        <Button variant="outline" size="sm" onClick={fetchProducts} disabled={productsLoading}>
          {productsLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Refresh
        </Button>
      </PageHeader>

      {/* Product Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Select onValueChange={setSelectedProductId} value={selectedProductId}>
            <SelectTrigger className="pl-9">
              <SelectValue placeholder="Search and select a product to view stock summary" />
            </SelectTrigger>
            <SelectContent>
              <div className="p-2 border-b">
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8"
                />
              </div>
              {productsLoading ? (
                <div className="py-4 text-center">
                  <Skeleton className="h-4 w-48 mx-auto mb-2" />
                  <Skeleton className="h-4 w-32 mx-auto" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">No products found</div>
              ) : filteredProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stock Summary Display */}
      {selectedProductId ? (
        <StockSummaryCard key={selectedProductId} productId={selectedProductId} />
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="size-16 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Select a product</p>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a product from the dropdown above to view its stock summary.
          </p>
        </div>
      )}
    </div>
  )
}
