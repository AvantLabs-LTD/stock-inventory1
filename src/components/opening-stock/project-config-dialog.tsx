'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Settings2,
  Plus,
  Trash2,
  Loader2,
  Package,
  AlertTriangle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectField {
  id: string
  name: string
  code: string
  createdAt: string
  productCount: number
}

interface ProjectConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProjectConfigDialog({
  open,
  onOpenChange,
  onUpdated,
}: ProjectConfigDialogProps) {
  const [fields, setFields] = useState<ProjectField[]>([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ProjectField | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchFields = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/opening-stock/projects')
      if (!res.ok) throw new Error('Failed to fetch project fields')
      const json = await res.json()
      setFields(json.data || [])
    } catch {
      toast.error('Failed to load project fields')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchFields()
  }, [open, fetchFields])

  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      setNewName('')
    }
    onOpenChange(open)
  }, [onOpenChange])

  // ─── Create ────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!newName.trim()) {
      toast.error('Name is required')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/opening-stock/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create project field')
      }
      toast.success(`Project field "${newName.trim()}" created`)
      setNewName('')
      fetchFields()
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project field')
    } finally {
      setCreating(false)
    }
  }, [newName, fetchFields, onUpdated])

  // ─── Delete ────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/opening-stock/projects/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete')
      }
      toast.success(`Project field "${deleteTarget.name}" deleted`)
      setDeleteDialogOpen(false)
      setDeleteTarget(null)
      fetchFields()
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete project field')
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, fetchFields, onUpdated])

  const confirmDelete = useCallback((field: ProjectField) => {
    setDeleteTarget(field)
    setDeleteDialogOpen(true)
  }, [])

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Manage Project Fields
            </DialogTitle>
            <DialogDescription>
              Add or remove dynamic project columns for your inventory register
            </DialogDescription>
          </DialogHeader>

          {/* Add New */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New project field name..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) handleCreate()
                }}
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add
            </Button>
          </div>

          <Separator />

          {/* List */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              ))
            ) : fields.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No project fields</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add project fields to track quantities per project
                </p>
              </div>
            ) : (
              fields.map((field) => (
                <div
                  key={field.id}
                  className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/30"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{field.name}</p>
                      <Badge variant="outline" className="text-xs font-mono">
                        {field.code}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {field.productCount} product{field.productCount !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        • Added {new Date(field.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                    onClick={() => confirmDelete(field)}
                    disabled={field.productCount > 0}
                  >
                    {field.productCount > 0 ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Info */}
          <div className="text-xs text-muted-foreground">
            Project fields appear as dynamic columns in the inventory table.
            Each column shows the quantity assigned to that project for each product.
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project Field</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This action cannot be undone.
              {deleteTarget && deleteTarget.productCount > 0 && (
                <span className="block mt-2 text-red-600 dark:text-red-400 font-medium">
                  This project field has {deleteTarget.productCount} linked product(s) and cannot be deleted.
                  Remove those links first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteTarget ? deleteTarget.productCount > 0 : false}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
