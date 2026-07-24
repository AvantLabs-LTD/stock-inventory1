'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Lock,
  Plus,
  Search,
  Unlock,
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
import { ReserveFormDialog } from '@/components/reserved/reserve-form-dialog'
import { ReleaseDialog } from '@/components/reserved/release-dialog'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface ReservationItem {
  id: string
  productId: string
  projectId: string
  quantity: number
  reason: string | null
  status: string
  reservedBy: string
  releasedBy: string | null
  releasedAt: string | null
  remarks: string | null
  createdAt: string
  product: { id: string; name: string; code: string; unit: string }
  project: { id: string; name: string; code: string }
  reservedByUser: { id: string; name: string; email: string }
  releasedByUser: { id: string; name: string } | null
}

interface ProjectOption {
  id: string
  name: string
  code: string
}

export function ReservedInventoryPage() {
  const user = useAuthStore((s) => s.user)
  const canReserve = user ? hasPermission(user.role, 'reserved_inventory', 'reserve') : false
  const canRelease = user ? hasPermission(user.role, 'reserved_inventory', 'release') : false

  const [items, setItems] = useState<ReservationItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters & pagination
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releaseTarget, setReleaseTarget] = useState<ReservationItem | null>(null)

  // Project options for filter dropdown
  const [projects, setProjects] = useState<ProjectOption[]>([])

  // Load projects for filter dropdown
  useEffect(() => {
    fetch('/api/projects?limit=200')
      .then((r) => r.json())
      .then((d) => setProjects((d.data || []).map((p: { id: string; name: string; code: string }) => ({ id: p.id, name: p.name, code: p.code }))))
      .catch(() => {})
  }, [])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search) params.set('search', search)
      if (projectId) params.set('projectId', projectId)
      if (status) params.set('status', status)

      const res = await fetch(`/api/reserved?${params}`)
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
  }, [page, limit, search, projectId, status])

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
    setProjectId('')
    setStatus('')
    setPage(1)
  }

  function handleRelease(item: ReservationItem) {
    setReleaseTarget(item)
    setReleaseOpen(true)
  }

  const hasFilters = search || projectId || status
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reserved Inventory"
        description="Manage product reservations for projects"
        icon={Lock}
      >
        {canReserve && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            Reserve Stock
          </Button>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by product, project, reason..."
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
          <Select value={status} onValueChange={(v) => { setStatus(v === '__none__' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="RELEASED">Released</SelectItem>
            </SelectContent>
          </Select>
          <Select value={projectId} onValueChange={(v) => { setProjectId(v === '__none__' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                    <span>{p.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <TableHead>Product</TableHead>
              <TableHead className="hidden sm:table-cell">Project</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="hidden md:table-cell">Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Reserved By</TableHead>
              <TableHead className="hidden xl:table-cell">Date</TableHead>
              <TableHead className="w-[60px] text-right">Actions</TableHead>
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
                    <Lock className="size-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium">No reservations yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {hasFilters
                        ? 'Try adjusting your search or filters.'
                        : canReserve
                          ? 'Click the button above to create your first reservation.'
                          : 'Reservations will appear here once created.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className="group">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm max-w-[160px] truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.product.code}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div>
                      <p className="text-sm">{item.project.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.project.code}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-semibold text-sm">
                    <span className="text-primary">{item.quantity}</span>
                    <span className="text-xs text-muted-foreground ml-0.5">{item.product.unit}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm max-w-[160px]">
                    <p className="truncate text-muted-foreground">
                      {item.reason || '—'}
                    </p>
                  </TableCell>
                  <TableCell>
                    {item.status === 'ACTIVE' ? (
                      <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Lock className="mr-1 size-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Unlock className="mr-1 size-3" />
                        Released
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {item.reservedByUser.name}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm whitespace-nowrap">
                    {format(new Date(item.createdAt), 'MMM dd, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.status === 'ACTIVE' && canRelease && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-orange-600"
                        onClick={() => handleRelease(item)}
                      >
                        <Unlock className="size-4" />
                        <span className="sr-only">Release</span>
                      </Button>
                    )}
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

      {/* Reserve Form Dialog */}
      <ReserveFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => {
          fetchItems()
          toast.success('Reservation created successfully')
        }}
      />

      {/* Release Confirmation Dialog */}
      <ReleaseDialog
        reservation={releaseTarget}
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        onSuccess={() => {
          setReleaseTarget(null)
          fetchItems()
          toast.success('Reservation released. Stock is now available.')
        }}
      />
    </div>
  )
}
