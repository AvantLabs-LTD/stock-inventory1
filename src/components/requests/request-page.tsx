'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  ClipboardList,
  Plus,
  Search,
  Eye,
  X,
  FileText,
  Hash,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { MaterialRequisitionForm } from './material-requisition-form'
import { RequisitionDetailDialog } from './requisition-detail-dialog'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RequisitionItemData {
  id: string
  productId: string
  requiredQty: number
  issuedQty: number
  product: { id: string; name: string; code: string; unit: string }
}

interface Requisition {
  id: string
  requisitionNo: string
  date: string
  departmentId: string
  projectId: string
  employeeName: string
  status: string
  createdAt: string
  department: { id: string; name: string; code: string }
  project: { id: string; name: string; code: string }
 requestedByUser: { id: string; name: string; email: string }
  items: RequisitionItemData[]
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

// ─── Status Colors ──────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  PARTIAL_APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  CLOSED: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

function StatusBadge({ status }: { status: string }) {
  const displayText = status === 'CLOSED' ? 'Closed' : status.replace(/_/g, ' ')
  return (
    <Badge className={`${statusColors[status] || 'bg-gray-100 text-gray-800'} text-[10px] font-semibold border-0`}>
      {displayText}
    </Badge>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function RequestPage() {
  const user = useAuthStore((s) => s.user)
  const canCreate = user ? hasPermission(user.role, 'inventory_requests', 'create') : false

  const [items, setItems] = useState<Requisition[]>([])
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
  const [activeTab, setActiveTab] = useState('ALL')

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Department options
  const [departments, setDepartments] = useState<DepartmentOption[]>([])

  useEffect(() => {
    fetch('/api/departments?limit=200&status=ACTIVE')
      .then((r) => r.json())
      .then((d) => setDepartments((d.data || []).map((dept: { id: string; name: string; code: string }) => ({ id: dept.id, name: dept.name, code: dept.code }))))
      .catch(() => {})
  }, [])

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
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('search', search)
      if (departmentId) params.set('departmentId', departmentId)
      if (projectId) params.set('projectId', projectId)
      if (activeTab !== 'ALL') params.set('status', activeTab)

      const res = await fetch(`/api/requisitions?${params}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.data || [])
        setTotal(data.pagination?.total || 0)
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [page, limit, search, departmentId, projectId, activeTab])

  useEffect(() => { fetchItems() }, [fetchItems])

  function handleSearch() { setSearch(searchInput); setPage(1) }

  function clearFilters() {
    setSearchInput(''); setSearch(''); setDepartmentId(''); setProjectId('')
    setProjects([]); setPage(1); setActiveTab('ALL')
  }

  function handleViewDetail(id: string) { setDetailId(id); setDetailOpen(true) }
  function handleTabChange(value: string) { setActiveTab(value); setPage(1) }

  const hasFilters = search || departmentId || projectId || activeTab !== 'ALL'
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Requests"
        description="Material requisitions — submit and manage inventory requests across departments"
        icon={ClipboardList}
      >
        {canCreate && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Requisition
          </Button>
        )}
      </PageHeader>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="ALL" className="text-xs">All</TabsTrigger>
          <TabsTrigger value="PENDING" className="text-xs">Pending</TabsTrigger>
          <TabsTrigger value="APPROVED" className="text-xs">Approved</TabsTrigger>
          <TabsTrigger value="CLOSED" className="text-xs">Closed</TabsTrigger>
          <TabsTrigger value="REJECTED" className="text-xs">Rejected</TabsTrigger>
          <TabsTrigger value="COMPLETED" className="text-xs">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by requisition #, department, project, employee..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSearch}>Search</Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v === '__none__' ? '' : v); setProjectId(''); setPage(1) }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {departmentId && (
            <Select value={projectId} onValueChange={(v) => { setProjectId(v === '__none__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Project" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
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
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Req #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="hidden md:table-cell">Project</TableHead>
              <TableHead className="hidden lg:table-cell">Employee</TableHead>
              <TableHead className="text-center">Items</TableHead>
              <TableHead className="text-center">Total Qty</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-[60px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <div className="flex flex-col items-center justify-center py-12">
                    <FileText className="size-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium">No material requisitions</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {hasFilters
                        ? 'Try adjusting your search or filters.'
                        : canCreate
                          ? 'Click the button above to submit your first requisition.'
                          : 'Material requisitions will appear here once submitted.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((req) => (
                <TableRow key={req.id} className="group">
                  <TableCell>
                    <span className="font-mono text-xs font-semibold text-primary">{req.requisitionNo}</span>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {format(new Date(req.date), 'dd-MMM-yy')}
                  </TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="outline" className="text-[10px] mr-1.5">{req.department.code}</Badge>
                    {req.department.name}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    <p>{req.project.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{req.project.code}</p>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{req.employeeName}</TableCell>
                  <TableCell className="text-center font-semibold text-sm">{req.items.length}</TableCell>
                  <TableCell className="text-center font-semibold text-sm">
                    <span className="text-primary">{req.items.reduce((s, i) => s + i.requiredQty, 0)}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={req.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => handleViewDetail(req.id)}>
                      <Eye className="size-4" />
                      <span className="sr-only">View</span>
                    </Button>
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
              <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                let pageNum: number
                if (totalPages <= 5) pageNum = i + 1
                else if (page <= 3) pageNum = i + 1
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
                else pageNum = page - 2 + i
                return (
                  <Button key={pageNum} variant={page === pageNum ? 'default' : 'outline'} size="icon" className="size-8" onClick={() => setPage(pageNum)}>
                    {pageNum}
                  </Button>
                )
              })}
              <Button variant="outline" size="icon" className="size-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</Button>
            </div>
          </div>
        </div>
      )}

      {/* New Requisition Form */}
      <MaterialRequisitionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => { fetchItems() }}
      />

      {/* Detail Dialog */}
      <RequisitionDetailDialog
        requisitionId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onAction={() => { fetchItems() }}
      />
    </div>
  )
}
