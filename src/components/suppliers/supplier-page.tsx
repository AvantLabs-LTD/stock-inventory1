'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Truck,
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
import { SupplierFormDialog } from '@/components/suppliers/supplier-form-dialog'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface Supplier {
  id: string
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  status: string
  _count: { products: number }
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  INACTIVE: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export function SupplierPage() {
  const user = useAuthStore((s) => s.user)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters & pagination
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState('')

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search) params.set('search', search)
      if (status) params.set('status', status)

      const res = await fetch(`/api/suppliers?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSuppliers(data.data || [])
        setTotal(data.pagination?.total || 0)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, status])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  function handleSearch() {
    setSearch(searchInput)
    setPage(1)
  }

  async function handleDelete() {
    if (!deletingSupplier) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/suppliers/${deletingSupplier.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Supplier deactivated successfully')
        setDeleteOpen(false)
        setDeletingSupplier(null)
        fetchSuppliers()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to deactivate supplier')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  function openEdit(supplier: Supplier) {
    setEditingSupplier(supplier)
    setFormOpen(true)
  }

  function openCreate() {
    setEditingSupplier(null)
    setFormOpen(true)
  }

  const totalPages = Math.ceil(total / limit)
  const canCreate = user ? hasPermission(user.role, 'suppliers', 'create') : false
  const canEdit = user ? hasPermission(user.role, 'suppliers', 'edit') : false
  const canDelete = user ? hasPermission(user.role, 'suppliers', 'delete') : false

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Manage supplier information and contacts"
        icon={Truck}
      >
        {canCreate && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Add Supplier
          </Button>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search suppliers..."
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
        <Select value={status} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1) }}>
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
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Contact Person</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">Email</TableHead>
              <TableHead className="hidden lg:table-cell">Products</TableHead>
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
            ) : suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-12">
                    <Truck className="size-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium">No suppliers found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search || status
                        ? 'Try adjusting your search or filters.'
                        : 'Get started by adding your first supplier.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((supplier) => (
                <TableRow key={supplier.id} className="group">
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">
                    {supplier.contactPerson || '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {supplier.phone || '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {supplier.email || '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center">
                    <Badge variant="secondary" className="font-mono">
                      {supplier._count.products}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-[10px] ${statusColorMap[supplier.status] || ''}`}>
                      {supplier.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <Pencil className="size-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && (
                          <DropdownMenuItem onClick={() => openEdit(supplier)}>
                            <Pencil className="mr-2 size-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {canDelete && supplier.status !== 'INACTIVE' && (
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 dark:text-red-400"
                            onClick={() => {
                              setDeletingSupplier(supplier)
                              setDeleteOpen(true)
                            }}
                          >
                            <Trash2 className="mr-2 size-4" />
                            Deactivate
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
      {!loading && suppliers.length > 0 && (
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
      <SupplierFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        supplier={editingSupplier}
        onSuccess={fetchSuppliers}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate &ldquo;{deletingSupplier?.name}&rdquo;? This will set the
              supplier status to Inactive.
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
              Deactivate Supplier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
