'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  BarChart3,
  Download,
  Loader2,
  ArrowLeft,
  X,
  Package,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  BoxIcon,
  Building2,
  FolderKanban,
  PackageCheck,
  ArrowUpFromLine,
  Lock,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import { useAppStore } from '@/stores/app-store'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

const REPORT_LABELS: Record<string, string> = {
  'inventory-summary': 'Inventory Summary',
  'inventory-ledger': 'Inventory Ledger',
  'goods-received': 'Goods Received',
  'goods-issued': 'Goods Issued',
  'department-usage': 'Department Usage',
  'project-usage': 'Project Usage',
  'reserved-inventory': 'Reserved Inventory',
  'low-stock': 'Low Stock Alert',
}

interface FilterOption {
  id: string
  name: string
}

interface StatCard {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
}

export function ReportView() {
  const reportType = useAppStore((s) => s.selectedProductId) as string
  const navigate = useAppStore((s) => s.navigate)
  const user = useAuthStore((s) => s.user)

  const [data, setData] = useState<unknown[]>([])
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')
  const [productId, setProductId] = useState('')
  const [supplierId, setSupplierId] = useState('')

  // Dropdown options
  const [categories, setCategories] = useState<FilterOption[]>([])
  const [departments, setDepartments] = useState<FilterOption[]>([])
  const [projects, setProjects] = useState<FilterOption[]>([])
  const [products, setProducts] = useState<FilterOption[]>([])
  const [suppliers, setSuppliers] = useState<FilterOption[]>([])

  const reportLabel = REPORT_LABELS[reportType] || 'Report'

  // Determine which filters are relevant per report type
  const showDateFilter = !['reserved-inventory', 'low-stock'].includes(reportType)
  const showCategoryFilter = reportType === 'inventory-summary'
  const showStatusFilter = reportType === 'inventory-summary'
  const showDepartmentFilter = ['inventory-summary', 'goods-issued', 'project-usage'].includes(reportType)
  const showProjectFilter = ['goods-issued', 'project-usage'].includes(reportType)
  const showProductFilter = reportType === 'inventory-ledger'
  const showSupplierFilter = ['goods-received'].includes(reportType)

  // Fetch dropdown options
  useEffect(() => {
    async function fetchOptions() {
      const fetches: Promise<void>[] = []
      if (showCategoryFilter) {
        fetches.push(
          fetch('/api/categories?limit=200')
            .then((r) => r.json())
            .then((d) => setCategories((d.data || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
            .catch(() => {})
        )
      }
      if (showDepartmentFilter) {
        fetches.push(
          fetch('/api/departments')
            .then((r) => r.json())
            .then((d) => setDepartments((d.data || d || []).map((dp: { id: string; name: string }) => ({ id: dp.id, name: dp.name }))))
            .catch(() => {})
        )
      }
      if (showProjectFilter || showDepartmentFilter) {
        fetches.push(
          fetch('/api/projects?limit=200')
            .then((r) => r.json())
            .then((d) => setProjects((d.data || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
            .catch(() => {})
        )
      }
      if (showProductFilter) {
        fetches.push(
          fetch('/api/products?limit=200')
            .then((r) => r.json())
            .then((d) => setProducts((d.data || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
            .catch(() => {})
        )
      }
      if (showSupplierFilter) {
        fetches.push(
          fetch('/api/suppliers?limit=200')
            .then((r) => r.json())
            .then((d) => setSuppliers((d.data || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))))
            .catch(() => {})
        )
      }
      await Promise.all(fetches)
    }
    fetchOptions()
  }, [showCategoryFilter, showDepartmentFilter, showProjectFilter, showProductFilter, showSupplierFilter])

  // Fetch report data
  const fetchReport = useCallback(async () => {
    if (!reportType) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (categoryId) params.set('categoryId', categoryId)
      if (departmentId) params.set('departmentId', departmentId)
      if (projectId) params.set('projectId', projectId)
      if (status) params.set('status', status)
      if (productId) params.set('productId', productId)
      if (supplierId) params.set('supplierId', supplierId)

      const res = await fetch(`/api/reports/${reportType}?${params}`)
      if (res.ok) {
        const json = await res.json()
        setData(json.data || [])
        setSummary(json.summary || {})
      } else {
        const json = await res.json()
        toast.error(json.error || 'Failed to load report')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }, [reportType, dateFrom, dateTo, categoryId, departmentId, projectId, status, productId, supplierId])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setCategoryId('')
    setDepartmentId('')
    setProjectId('')
    setStatus('')
    setProductId('')
    setSupplierId('')
  }

  const hasFilters = dateFrom || dateTo || categoryId || departmentId || projectId || status || productId || supplierId

  // Export CSV
  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams({ reportType })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (categoryId) params.set('categoryId', categoryId)
      if (departmentId) params.set('departmentId', departmentId)
      if (projectId) params.set('projectId', projectId)
      if (status) params.set('status', status)
      if (productId) params.set('productId', productId)
      if (supplierId) params.set('supplierId', supplierId)

      const res = await fetch(`/api/reports/export/excel?${params}`)
      if (!res.ok) {
        toast.error('Export failed')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition')
      const filename = disposition
        ? disposition.split('filename=')[1]?.replace(/"/g, '')
        : `${reportType}.csv`
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Report exported successfully')
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  // Build stat cards based on report type
  function getStatCards(): StatCard[] {
    switch (reportType) {
      case 'inventory-summary':
        return [
          { label: 'Total Products', value: summary.totalProducts ?? 0, icon: Package, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30' },
          { label: 'Total Available', value: (summary.totalAvailable ?? 0).toLocaleString(), icon: BoxIcon, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Total Value', value: formatCurrency(summary.totalValue ?? 0), icon: DollarSign, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Low Stock Items', value: summary.lowStockCount ?? 0, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-950/30' },
        ]
      case 'inventory-ledger':
        return [
          { label: 'Products', value: (data as Array<{ productId: string }>).length, icon: Package, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30' },
          { label: 'Total Transactions', value: (data as Array<{ transactions: unknown[] }>).reduce((s: number, d: { transactions: unknown[] }) => s + d.transactions.length, 0), icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
        ]
      case 'goods-received':
        return [
          { label: 'Total Records', value: summary.totalRecords ?? 0, icon: PackageCheck, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30' },
          { label: 'Total Quantity', value: (summary.totalQuantity ?? 0).toLocaleString(), icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Total Value', value: formatCurrency(summary.totalValue ?? 0), icon: DollarSign, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
        ]
      case 'goods-issued':
        return [
          { label: 'Total Records', value: summary.totalRecords ?? 0, icon: ArrowUpFromLine, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30' },
          { label: 'Total Issued', value: (summary.totalIssued ?? 0).toLocaleString(), icon: TrendingUp, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30' },
          { label: 'Products', value: summary.uniqueProducts ?? 0, icon: Package, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Departments', value: summary.uniqueDepartments ?? 0, icon: Building2, color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30' },
        ]
      case 'department-usage':
        return [
          { label: 'Departments', value: summary.totalDepartments ?? 0, icon: Building2, color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30' },
          { label: 'Total Issued', value: (summary.totalIssued ?? 0).toLocaleString(), icon: TrendingUp, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30' },
          { label: 'Total Returned', value: (summary.totalReturned ?? 0).toLocaleString(), icon: TrendingDown, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Net Usage', value: (summary.netUsage ?? 0).toLocaleString(), icon: BarChart3, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
        ]
      case 'project-usage':
        return [
          { label: 'Projects', value: summary.totalProjects ?? 0, icon: FolderKanban, color: 'text-pink-600 bg-pink-50 dark:bg-pink-950/30' },
          { label: 'Total Issued', value: (summary.totalIssued ?? 0).toLocaleString(), icon: TrendingUp, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30' },
          { label: 'Total Returned', value: (summary.totalReturned ?? 0).toLocaleString(), icon: TrendingDown, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Total Reserved', value: (summary.totalReserved ?? 0).toLocaleString(), icon: Lock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
        ]
      case 'reserved-inventory':
        return [
          { label: 'Reservations', value: summary.totalRecords ?? 0, icon: Lock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Total Reserved', value: (summary.totalReserved ?? 0).toLocaleString(), icon: TrendingUp, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30' },
          { label: 'Products', value: summary.uniqueProducts ?? 0, icon: Package, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Projects', value: summary.uniqueProjects ?? 0, icon: FolderKanban, color: 'text-pink-600 bg-pink-50 dark:bg-pink-950/30' },
        ]
      case 'low-stock':
        return [
          { label: 'Low Stock Items', value: summary.totalLowStock ?? 0, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-950/30' },
          { label: 'Out of Stock', value: summary.outOfStockCount ?? 0, icon: AlertTriangle, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30' },
          { label: 'Total Deficit', value: (summary.totalDeficit ?? 0).toLocaleString(), icon: TrendingDown, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30' },
          { label: 'Value at Risk', value: formatCurrency(summary.totalValueAtRisk ?? 0), icon: DollarSign, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
        ]
      default:
        return []
    }
  }

  function renderTable() {
    if (loading) {
      return (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableHead key={i}><Skeleton className="h-4 w-24" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )
    }

    if (data.length === 0) {
      return (
        <div className="rounded-lg border">
          <div className="flex flex-col items-center justify-center py-16">
            <BarChart3 className="size-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">No data found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasFilters ? 'Try adjusting your filters.' : 'No records match this report.'}
            </p>
          </div>
        </div>
      )
    }

    switch (reportType) {
      case 'inventory-summary': return renderInventorySummary()
      case 'inventory-ledger': return renderInventoryLedger()
      case 'goods-received': return renderGoodsReceived()
      case 'goods-issued': return renderGoodsIssued()
      case 'department-usage': return renderDepartmentUsage()
      case 'project-usage': return renderProjectUsage()
      case 'reserved-inventory': return renderReservedInventory()
      case 'low-stock': return renderLowStock()
      default:
        return <p className="text-sm text-muted-foreground py-8 text-center">Unknown report type</p>
    }
  }

  function renderInventorySummary() {
    const rows = data as Array<Record<string, unknown>>
    return (
      <div className="rounded-lg border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="hidden lg:table-cell">Supplier</TableHead>
              <TableHead className="text-center">Opening</TableHead>
              <TableHead className="text-center">Received</TableHead>
              <TableHead className="text-center">Issued</TableHead>
              <TableHead className="text-center">Returned</TableHead>
              <TableHead className="text-center">Reserved</TableHead>
              <TableHead className="text-center font-semibold">Available</TableHead>
              <TableHead className="hidden sm:table-cell text-right">Unit Cost</TableHead>
              <TableHead className="text-right font-semibold">Total Value</TableHead>
              <TableHead className="hidden lg:table-cell text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id as string}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm max-w-[180px] truncate">{row.name as string}</p>
                    <p className="text-xs text-muted-foreground font-mono">{row.code as string}</p>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">{row.category as string || '—'}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{row.supplier as string || '—'}</TableCell>
                <TableCell className="text-center text-sm">{row.opening as number}</TableCell>
                <TableCell className="text-center text-sm text-emerald-600">{row.received as number}</TableCell>
                <TableCell className="text-center text-sm text-orange-600">{row.issued as number}</TableCell>
                <TableCell className="text-center text-sm text-sky-600">{row.returned as number}</TableCell>
                <TableCell className="text-center text-sm text-amber-600">{row.reserved as number}</TableCell>
                <TableCell className="text-center font-semibold">
                  <span className={((row.available as number) <= 0) ? 'text-red-600' : (row.isLowStock as boolean) ? 'text-amber-600' : ''}>
                    {Math.max(0, row.available as number)}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right text-sm">{formatCurrency(row.unitCost as number)}</TableCell>
                <TableCell className="text-right text-sm font-semibold">{formatCurrency(row.totalValue as number)}</TableCell>
                <TableCell className="hidden lg:table-cell text-center">
                  {(row.isLowStock as boolean) ? (
                    <Badge variant={(row.available as number) <= 0 ? 'destructive' : 'secondary'} className="text-[10px]">
                      {(row.available as number) <= 0 ? 'Out of Stock' : 'Low Stock'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-emerald-600">Healthy</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  function renderInventoryLedger() {
    const groups = data as Array<{
      productId: string
      product: { name: string; code: string; sku: string; unit: string }
      transactions: Array<{
        id: string; type: string; quantity: number; unitCost: number | null
        reference: string | null; remarks: string | null; date: string; runningBalance: number
      }>
    }>
    return (
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.productId} className="rounded-lg border">
            <div className="px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <Package className="size-4 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-sm">{group.product.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{group.product.code} · {group.product.sku} · {group.product.unit}</p>
                </div>
              </div>
            </div>
            <div className="overflow-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Qty In</TableHead>
                    <TableHead className="text-center">Qty Out</TableHead>
                    <TableHead className="hidden sm:table-cell">Reference</TableHead>
                    <TableHead className="hidden md:table-cell">Remarks</TableHead>
                    <TableHead className="text-right font-semibold">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.transactions.map((tx) => {
                    const isIn = ['OPENING_STOCK', 'GOODS_RECEIVED', 'RETURNED', 'ADJUSTMENT_IN'].includes(tx.type)
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm whitespace-nowrap">{format(new Date(tx.date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                            {tx.type.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-center text-sm font-medium ${isIn ? 'text-emerald-600' : ''}`}>{isIn ? tx.quantity : ''}</TableCell>
                        <TableCell className={`text-center text-sm font-medium ${!isIn ? 'text-orange-600' : ''}`}>{!isIn ? tx.quantity : ''}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm font-mono text-muted-foreground">{tx.reference || '—'}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">{tx.remarks || '—'}</TableCell>
                        <TableCell className={`text-right text-sm font-semibold ${tx.runningBalance < 0 ? 'text-red-600' : ''}`}>
                          {tx.runningBalance}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderGoodsReceived() {
    const rows = data as Array<Record<string, unknown>>
    return (
      <div className="rounded-lg border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="hidden md:table-cell">Supplier</TableHead>
              <TableHead className="hidden lg:table-cell">Invoice #</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="hidden sm:table-cell text-right">Unit Cost</TableHead>
              <TableHead className="text-right font-semibold">Total Cost</TableHead>
              <TableHead className="hidden lg:table-cell">Received By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const product = row.product as { name: string; code: string; unit: string }
              const supplier = row.supplier as { name: string } | null
              const receivedByUser = row.receivedByUser as { name: string }
              return (
                <TableRow key={row.id as string}>
                  <TableCell className="text-sm whitespace-nowrap">{format(new Date(row.date as string), 'MMM dd, yyyy')}</TableCell>
                  <TableCell>
                    <p className="font-medium text-sm max-w-[180px] truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{product.code}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{supplier?.name || '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm font-mono">{(row.invoiceNumber as string) || '—'}</TableCell>
                  <TableCell className="text-center font-medium text-sm">{row.quantity as number} {product.unit}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right text-sm">{formatCurrency(row.unitCost as number)}</TableCell>
                  <TableCell className="text-right font-semibold text-sm">{formatCurrency(row.totalCost as number)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{receivedByUser.name}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    )
  }

  function renderGoodsIssued() {
    const rows = data as Array<Record<string, unknown>>
    return (
      <div className="rounded-lg border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="hidden sm:table-cell">Department</TableHead>
              <TableHead className="hidden md:table-cell">Project</TableHead>
              <TableHead className="hidden lg:table-cell">Employee</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="hidden lg:table-cell">Issued By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const product = row.product as { name: string; code: string; unit: string }
              const department = row.department as { name: string }
              const project = row.project as { name: string }
              const issuedByUser = row.issuedByUser as { name: string }
              return (
                <TableRow key={row.id as string}>
                  <TableCell className="text-sm whitespace-nowrap">{format(new Date(row.date as string), 'MMM dd, yyyy')}</TableCell>
                  <TableCell>
                    <p className="font-medium text-sm max-w-[180px] truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{product.code}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">{department.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{project.name}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{row.employeeName as string}</TableCell>
                  <TableCell className="text-center font-medium text-sm">{row.quantity as number} {product.unit}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{issuedByUser.name}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    )
  }

  function renderDepartmentUsage() {
    const rows = data as Array<Record<string, unknown>>
    return (
      <div className="rounded-lg border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="hidden sm:table-cell">Code</TableHead>
              <TableHead className="text-center">Total Issued</TableHead>
              <TableHead className="hidden sm:table-cell text-center">Issue Count</TableHead>
              <TableHead className="text-center">Total Returned</TableHead>
              <TableHead className="hidden sm:table-cell text-center">Return Count</TableHead>
              <TableHead className="text-right font-semibold">Net Usage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium text-sm">{row.departmentName as string}</TableCell>
                <TableCell className="hidden sm:table-cell text-sm font-mono text-muted-foreground">{row.departmentCode as string}</TableCell>
                <TableCell className="text-center text-sm font-medium text-orange-600">{(row.totalIssued as number).toLocaleString()}</TableCell>
                <TableCell className="hidden sm:table-cell text-center text-sm text-muted-foreground">{row.issueCount as number}</TableCell>
                <TableCell className="text-center text-sm font-medium text-emerald-600">{(row.totalReturned as number).toLocaleString()}</TableCell>
                <TableCell className="hidden sm:table-cell text-center text-sm text-muted-foreground">{row.returnCount as number}</TableCell>
                <TableCell className={`text-right font-semibold text-sm ${(row.netUsage as number) > 0 ? '' : 'text-emerald-600'}`}>
                  {(row.netUsage as number).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  function renderProjectUsage() {
    const rows = data as Array<Record<string, unknown>>
    return (
      <div className="rounded-lg border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead className="hidden sm:table-cell">Department</TableHead>
              <TableHead className="hidden lg:table-cell">Status</TableHead>
              <TableHead className="text-center">Total Issued</TableHead>
              <TableHead className="text-center">Total Returned</TableHead>
              <TableHead className="text-center">Reserved</TableHead>
              <TableHead className="text-right font-semibold">Net Usage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  <p className="font-medium text-sm max-w-[180px] truncate">{row.projectName as string}</p>
                  <p className="text-xs text-muted-foreground font-mono">{row.projectCode as string}</p>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm">{row.departmentName as string || '—'}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Badge variant="outline" className="text-[10px]">{row.projectStatus as string}</Badge>
                </TableCell>
                <TableCell className="text-center text-sm font-medium text-orange-600">{(row.totalIssued as number).toLocaleString()}</TableCell>
                <TableCell className="text-center text-sm font-medium text-emerald-600">{(row.totalReturned as number).toLocaleString()}</TableCell>
                <TableCell className="text-center text-sm font-medium text-amber-600">{(row.totalReserved as number).toLocaleString()}</TableCell>
                <TableCell className={`text-right font-semibold text-sm ${(row.netUsage as number) > 0 ? '' : 'text-emerald-600'}`}>
                  {(row.netUsage as number).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  function renderReservedInventory() {
    const rows = data as Array<Record<string, unknown>>
    return (
      <div className="rounded-lg border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="hidden sm:table-cell">Project</TableHead>
              <TableHead className="hidden md:table-cell">Department</TableHead>
              <TableHead className="text-center">Quantity</TableHead>
              <TableHead className="hidden lg:table-cell">Reason</TableHead>
              <TableHead className="hidden sm:table-cell">Reserved By</TableHead>
              <TableHead className="hidden lg:table-cell">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const product = row.product as { name: string; code: string; unit: string }
              const project = row.project as { name: string; code: string; department: { name: string } }
              const reservedByUser = row.reservedByUser as { name: string }
              return (
                <TableRow key={row.id as string}>
                  <TableCell>
                    <p className="font-medium text-sm max-w-[180px] truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{product.code}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">
                    <p>{project.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{project.code}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{project.department.name}</TableCell>
                  <TableCell className="text-center font-medium text-sm">{row.quantity as number} {product.unit}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[200px] truncate">{(row.reason as string) || '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">{reservedByUser.name}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{format(new Date(row.createdAt as string), 'MMM dd, yyyy')}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    )
  }

  function renderLowStock() {
    const rows = data as Array<Record<string, unknown>>
    return (
      <div className="rounded-lg border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="hidden lg:table-cell">Supplier</TableHead>
              <TableHead className="text-center">Min Stock</TableHead>
              <TableHead className="text-center font-semibold">Available</TableHead>
              <TableHead className="text-center font-semibold">Deficit</TableHead>
              <TableHead className="hidden sm:table-cell text-right">Unit Cost</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id as string} className={(row.isOutOfStock as boolean) ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                <TableCell>
                  <p className="font-medium text-sm max-w-[180px] truncate">{row.name as string}</p>
                  <p className="text-xs text-muted-foreground font-mono">{row.code as string}</p>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">{row.category as string || '—'}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{row.supplier as string || '—'}</TableCell>
                <TableCell className="text-center text-sm">{row.minimumStock as number}</TableCell>
                <TableCell className="text-center font-semibold text-sm">
                  <span className={(row.available as number) <= 0 ? 'text-red-600' : 'text-amber-600'}>
                    {Math.max(0, row.available as number)}
                  </span>
                </TableCell>
                <TableCell className="text-center font-semibold text-sm text-red-600">
                  {(row.deficit as number) > 0 ? (row.deficit as number) : '0'}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right text-sm">{formatCurrency(row.unitCost as number)}</TableCell>
                <TableCell className="text-right text-sm">{formatCurrency(row.totalValue as number)}</TableCell>
                <TableCell className="text-center">
                  {(row.isOutOfStock as boolean) ? (
                    <Badge variant="destructive" className="text-[10px]">Out of Stock</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30">Low Stock</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (!reportType) return null

  const canView = user ? hasPermission(user.role, 'reports', 'view') : false
  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Access denied" icon={BarChart3} />
        <div className="rounded-lg border">
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-lg font-medium">Access Denied</p>
            <p className="text-sm text-muted-foreground mt-1">You do not have permission to view reports.</p>
          </div>
        </div>
      </div>
    )
  }

  const statCards = getStatCards()

  return (
    <div className="space-y-6">
      <PageHeader
        title={reportLabel}
        description="View and export report data"
        icon={BarChart3}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('reports')}>
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || loading}>
            {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            Export CSV
          </Button>
        </div>
      </PageHeader>

      {/* Summary stat cards */
      }
      {statCards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`inline-flex items-center justify-center size-9 rounded-lg ${stat.color}`}>
                    <stat.icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                    <p className="text-lg font-bold leading-tight truncate">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      {(showDateFilter || showCategoryFilter || showDepartmentFilter || showProjectFilter || showStatusFilter || showProductFilter || showSupplierFilter) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          {showDateFilter && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="w-[140px]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="From"
              />
              <Input
                type="date"
                className="w-[140px]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="To"
              />
            </div>
          )}
          {showCategoryFilter && categories.length > 0 && (
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {showStatusFilter && (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
              </SelectContent>
            </Select>
          )}
          {showDepartmentFilter && departments.length > 0 && (
            <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v); setProjectId('') }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {showProjectFilter && projects.length > 0 && (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects
                  .filter((p) => !departmentId || departmentId === 'all')
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          {showProductFilter && products.length > 0 && (
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="all">All Products</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {showSupplierFilter && suppliers.length > 0 && (
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Suppliers" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hasFilters && (
            <Button variant="ghost" size="icon" className="size-8" onClick={clearFilters}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      {renderTable()}
    </div>
  )
}
