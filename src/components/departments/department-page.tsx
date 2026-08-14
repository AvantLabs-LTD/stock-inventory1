'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Building2,
  Eye,
  Loader2,
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
import { DepartmentFormDialog, type Department } from '@/components/departments/department-form-dialog'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { toast } from 'sonner'

const statusColorMap: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  INACTIVE: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export function DepartmentPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useAppStore((s) => s.navigate)
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState('')

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingDept, setDeletingDept] = useState<Department | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchDepartments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)

      const res = await fetch(`/api/departments?${params}`)
      if (res.ok) {
        const data = await res.json()
        let items: Department[] = data.data || []
        if (status) {
          items = items.filter((d: Department) => d.status === status)
        }
        setDepartments(items)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [search, status])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  function handleSearch() {
    setSearch(searchInput)
  }

  async function handleDelete() {
    if (!deletingDept) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/departments/${deletingDept.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Department deleted successfully')
        setDeleteOpen(false)
        setDeletingDept(null)
        fetchDepartments()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to delete department')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  function openEdit(dept: Department) {
    setEditingDept(dept)
    setFormOpen(true)
  }

  function openCreate() {
    setEditingDept(null)
    setFormOpen(true)
  }

  function openDetail(dept: Department) {
    navigate('department-detail', dept.id)
  }

  const canCreate = user ? hasPermission(user.role, 'departments', 'create') : false
  const canEdit = user ? hasPermission(user.role, 'departments', 'edit') : false
  const canDelete = user ? hasPermission(user.role, 'departments', 'delete') : false

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Manage organizational departments and teams"
        icon={Building2}
      >
        {canCreate && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Add Department
          </Button>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search departments..."
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
        <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Head</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell text-center">Users</TableHead>
              <TableHead className="hidden lg:table-cell text-center">Projects</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px] text-right">Actions</TableHead>
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
            ) : departments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="flex flex-col items-center justify-center py-12">
                    <Building2 className="size-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium">No departments found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search || status
                        ? 'Try adjusting your search or filters.'
                        : 'Get started by adding your first department.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              departments.map((dept) => (
                <TableRow key={dept.id} className="group">
                  <TableCell className="font-mono text-sm">{dept.code}</TableCell>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">
                    {dept.headName || '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {dept.phone || '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center">
                    <Badge variant="secondary" className="font-mono">
                      {dept._count.users}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center">
                    <Badge variant="secondary" className="font-mono">
                      {dept._count.projects}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-[10px] ${statusColorMap[dept.status] || ''}`}>
                      {dept.status}
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
                        <DropdownMenuItem onClick={() => openDetail(dept)}>
                          <Eye className="mr-2 size-4" />
                          View Details
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem onClick={() => openEdit(dept)}>
                            <Pencil className="mr-2 size-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 dark:text-red-400"
                            onClick={() => {
                              setDeletingDept(dept)
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

      {/* Form Dialog */}
      <DepartmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        department={editingDept}
        onSuccess={fetchDepartments}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete &ldquo;{deletingDept?.name}&rdquo;? This action
              cannot be undone. The department must have no users and no projects to be deleted.
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
              Delete Department
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
