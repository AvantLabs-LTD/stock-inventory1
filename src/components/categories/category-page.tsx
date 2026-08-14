'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Tags,
  FolderTree,
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
import { CategoryFormDialog } from '@/components/categories/category-form-dialog'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface Category {
  id: string
  name: string
  code: string
  description: string | null
  parentId: string | null
  status: string
  parent: { id: string; name: string } | null
  _count: { children: number; products: number }
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  INACTIVE: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export function CategoryPage() {
  const user = useAuthStore((s) => s.user)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)

      const res = await fetch(`/api/categories?${params}`)
      if (res.ok) {
        const data = await res.json()
        setCategories(data.data || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  function handleSearch() {
    setSearch(searchInput)
  }

  async function handleDelete() {
    if (!deletingCategory) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/categories/${deletingCategory.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Category deleted successfully')
        setDeleteOpen(false)
        setDeletingCategory(null)
        fetchCategories()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to delete category')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  function openEdit(category: Category) {
    setEditingCategory(category)
    setFormOpen(true)
  }

  function openCreate() {
    setEditingCategory(null)
    setFormOpen(true)
  }

  const canCreate = user ? hasPermission(user.role, 'categories', 'create') : false
  const canEdit = user ? hasPermission(user.role, 'categories', 'edit') : false
  const canDelete = user ? hasPermission(user.role, 'categories', 'delete') : false

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Organize products with categories and subcategories"
        icon={Tags}
      >
        {canCreate && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Add Category
          </Button>
        )}
      </PageHeader>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
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

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Parent</TableHead>
              <TableHead className="hidden md:table-cell">Description</TableHead>
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
            ) : categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-12">
                    <FolderTree className="size-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium">No categories found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search
                        ? 'Try adjusting your search.'
                        : 'Get started by creating your first category.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <TableRow key={category.id} className="group">
                  <TableCell className="font-mono text-xs">{category.code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {category.parentId && (
                        <span className="text-muted-foreground">└</span>
                      )}
                      <span className="font-medium">{category.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {category.parent ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {category.parent.name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                    {category.description || '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-center">
                    <Badge variant="secondary" className="font-mono">
                      {category._count.products}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-[10px] ${statusColorMap[category.status] || ''}`}>
                      {category.status}
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
                          <DropdownMenuItem onClick={() => openEdit(category)}>
                            <Pencil className="mr-2 size-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 dark:text-red-400"
                            onClick={() => {
                              setDeletingCategory(category)
                              setDeleteOpen(true)
                            }}
                            disabled={category._count.children > 0 || category._count.products > 0}
                          >
                            <Trash2 className="mr-2 size-4" />
                            {category._count.children > 0 || category._count.products > 0
                              ? 'Cannot Delete'
                              : 'Delete'}
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
      <CategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editingCategory}
        categories={categories}
        onSuccess={fetchCategories}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deletingCategory?.name}&rdquo;? This action cannot
              be undone.
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
              Delete Category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
