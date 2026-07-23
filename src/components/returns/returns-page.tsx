'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  RotateCcw,
  Plus,
  Search,
  X,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import { ReturnFormDialog } from '@/components/returns/return-form-dialog'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface ReturnItem {
  id: string
  productId: string
  departmentId: string
  projectId: string
  returnedBy: string
  employeeName: string
  quantity: number
  remarks: string | null
  date: string
  createdAt: string
  product: { id: string; name: string; code: string; unit: string }
  department: { id: string; name: string; code: string }
  project: { id: string; name: string; code: string }
  returnedByUser: { id: string; name: string }
}

interface DepartmentOption {
  id: string
  name: string
  code: string
}

interface ProjectOption {
  id: string
  name: string
  code: string
  departmentId: string
}

export function ReturnsPage() {
  const user = useAuthStore((s) => s.user)
  const canReturn = user ? hasPermission(user.role, 'returns', 'return') : false

  const [items, setItems] = useState<ReturnItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters & pagination
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Dialog
  const [formOpen, setFormOpen] = useState(false)

  // Department options for filter
  const [departments, setDepartments] = useState<DepartmentOption[]>([])

  // Load departments for filter dropdown
  useEffect(() => {
    fetch('/api/departments?limit=200')
      .then((r) => r.json())
      .then((d) => setDepartments((d.data || []).map((dept: { id: string; name: string; code: string }) => ({ id: dept.id, name: dept.name, code: dept.code }))))
      .catch(() => {})
  }, [])

  // Load projects filtered by selected department
  useEffect(() => {
    if (departmentId) {
      fetch(`/api/projects?limit=200&departmentId=${departmentId}`)
        .then((r) => r.json())
        .then((d) => setProjects((d.data || []).map((p: { id: string; name: string; code: string; departmentId: string }) => ({ id: p.id, name: p.name, code: p.code, departmentId: p.departmentId }))))
        .catch(() => setProjects([]))
    } else {
      setProjects([])
      setProjectId('')
    }
  }, [departmentId])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search) params.set('search', search)
      if (departmentId) params.set('departmentId', departmentId)
      if (projectId) params.set('projectId', projectId)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await fetch(`/api/returns?${params}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.data || [])
        setTotal(data.pagination?.total || 0)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, departmentId, projectId, dateFrom, dateTo])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  function handleSearch() {
    setSearch(searchInput)
    setPage(1)
  }

  function clearFilters() {
    setSearchInput('')
    setSearch('')
    setDepartmentId('')
    setProjectId('')
    setDateFrom('')
    setDateTo('')
    setProjects([])
    setPage(1)
  }

  const hasFilters = search || departmentId || projectId || dateFrom || dateTo
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Returns"
        description="Track and manage inventory returned from departments and projects"
        icon={RotateCcw}
      >
        {canReturn && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            Record Return
          </Button>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by product, department, project, employee..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSearch}>
            Search
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v === '__none__' ? '' : v); setProjectId(''); setPage(1) }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {departmentId && (
            <Select value={projectId} onValueChange={(v) => { setProjectId(v === '__none__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            type="date"
            className="w-[150px]"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
          />
          <Input
            type="date"
            className="w-[150px]"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
          />
          {hasFilters && (
            <Button variant="ghost" size="icon" className="size-8" onClick={clearFilters}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="hidden sm:table-cell">Department</TableHead>
              <TableHead className="hidden md:table-cell">Project</TableHead>
              <TableHead className="hidden lg:table-cell">Employee</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="hidden lg:table-cell">Returned By</TableHead>
              <TableHead className="hidden xl:table-cell">Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="flex flex-col items-center justify-center py-12">
                    <RotateCcw className="size-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium">No returns recorded yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {hasFilters
                        ? 'Try adjusting your search or filters.'
                        : canReturn
                          ? 'Click the button above to record your first return.'
                          : 'Returns will appear here once recorded.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {format(new Date(item.date), 'MMM dd, yyyy')}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm max-w-[160px] truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.product.code}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">
                    <Badge variant="outline" className="text-[10px]">
                      {item.department.code}
                    </Badge>
                    <span className="ml-1.5 text-sm">{item.department.name}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    <div>
                      <p className="text-sm">{item.project.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.project.code}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {item.employeeName}
                  </TableCell>
                  <TableCell className="text-center font-semibold text-sm">
                    <span className="text-green-600">+{item.quantity}</span>
                    <span className="text-xs text-muted-foreground ml-0.5">{item.product.unit}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {item.returnedByUser.name}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm max-w-[180px]">
                    <p className="truncate text-muted-foreground">
                      {item.remarks || '—'}
                    </p>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {Math.min((page - 1) * limit + 1, total)} to {Math.min(page * limit, total)} of {total} results
          </p>
          <div className="flex items-center gap-2">
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? 'default' : 'outline'}
                    size="icon"
                    className="size-8"
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Form Dialog */}
      <ReturnFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => {
          fetchItems()
          toast.success('Return recorded successfully')
        }}
      />
    </div>
  )
}
