'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  FolderKanban,
  Eye,
  Loader2,
  Upload,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/shared/page-header'
import { ProjectFormDialog, type Project } from '@/components/projects/project-form-dialog'
import { BomUploadDialog } from '@/components/projects/bom-upload-dialog'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface DeptOption {
  id: string
  name: string
  code: string
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  ON_HOLD: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

export function ProjectPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useAppStore((s) => s.navigate)
  const [projects, setProjects] = useState<Project[]>([])
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters & pagination
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState('')

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)
  // BOM
  const [bomOpen, setBomOpen] = useState(false)
  const [bomProject, setBomProject] = useState<Project | null>(null)

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments')
      if (res.ok) {
        const data = await res.json()
        setDepartments(data.data || [])
      }
    } catch {
      // ignore
    }
  }, [])

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search) params.set('search', search)
      if (departmentId) params.set('departmentId', departmentId)
      if (status) params.set('status', status)

      const res = await fetch(`/api/projects?${params}`)
      if (res.ok) {
        const data = await res.json()
        setProjects(data.data || [])
        setTotal(data.pagination?.total || 0)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, departmentId, status])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  function handleSearch() {
    setSearch(searchInput)
    setPage(1)
  }

  async function handleDelete() {
    if (!deletingProject) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${deletingProject.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Project deleted successfully')
        setDeleteOpen(false)
        setDeletingProject(null)
        fetchProjects()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to delete project')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  function openEdit(project: Project) {
    setEditingProject(project)
    setFormOpen(true)
  }

  function openCreate() {
    setEditingProject(null)
    setFormOpen(true)
  }

  function openDetail(project: Project) {
    navigate('project-detail', project.id)
  }

  const totalPages = Math.ceil(total / limit)
  const canCreate = user ? hasPermission(user.role, 'projects', 'create') : false
  const canEdit = user ? hasPermission(user.role, 'projects', 'edit') : false
  const canDelete = user ? hasPermission(user.role, 'projects', 'delete') : false

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Manage projects and track inventory allocation"
        icon={FolderKanban}
      >
        {canCreate && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Add Project
          </Button>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
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
        <div className="flex items-center gap-2">
          <Select value={departmentId || 'all'} onValueChange={(v) => { setDepartmentId(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status || 'all'} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="ON_HOLD">On Hold</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Department</TableHead>
              <TableHead className="hidden md:table-cell">Start Date</TableHead>
              <TableHead className="hidden lg:table-cell">End Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-12">
                    <FolderKanban className="size-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium">No projects found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search || departmentId || status
                        ? 'Try adjusting your search or filters.'
                        : 'Get started by adding your first project.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              projects.map((proj) => (
                <TableRow key={proj.id} className="group">
                  <TableCell className="font-mono text-sm">{proj.code}</TableCell>
                  <TableCell className="font-medium">{proj.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">
                    {proj.department?.name || '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {proj.startDate ? format(new Date(proj.startDate), 'MMM dd, yyyy') : '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {proj.endDate ? format(new Date(proj.endDate), 'MMM dd, yyyy') : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-[10px] ${statusColorMap[proj.status] || ''}`}>
                      {proj.status.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <Eye className="size-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetail(proj)}>
                          <Eye className="mr-2 size-4" />
                          View Details
                        </DropdownMenuItem>
                        {canEdit && (
                          <>
                            <DropdownMenuItem onClick={() => { setBomProject(proj); setBomOpen(true) }}>
                              <Upload className="mr-2 size-4" />
                              Upload BOM
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(proj)}>
                              <Pencil className="mr-2 size-4" />
                              Edit
                            </DropdownMenuItem>
                          </>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 dark:text-red-400"
                            onClick={() => {
                              setDeletingProject(proj)
                              setDeleteOpen(true)
                            }}
                          >
                            <Trash2 className="mr-2 size-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && projects.length > 0 && (
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
      <ProjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editingProject}
        onSuccess={fetchProjects}
      />

      {/* BOM Upload Dialog */}
      <BomUploadDialog
        open={bomOpen}
        onOpenChange={(open) => { if (!open) setBomProject(null); setBomOpen(open) }}
        projectId={bomProject?.id || null}
        projectName={bomProject?.name || ''}
        onSuccess={fetchProjects}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete &ldquo;{deletingProject?.name}&rdquo;? This action
              cannot be undone. The project must have no issues and no requests to be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
