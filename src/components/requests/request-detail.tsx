'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Package,
  Building2,
  FolderKanban,
  User,
  Hash,
  FileText,
  Mail,
  CheckCircle,
  XCircle,
  CheckCheck,
  Loader2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { ApproveDialog } from '@/components/requests/approve-dialog'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface RequestDetailData {
  id: string
  productId: string
  departmentId: string
  projectId: string
  requestedBy: string
  employeeName: string
  quantity: number
  approvedQty: number
  priority: string
  reason: string | null
  remarks: string | null
  status: string
  approvedBy: string | null
  approvedAt: string | null
  completedBy: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  product: { id: string; name: string; code: string; sku: string; unit: string }
  department: { id: string; name: string; code: string }
  project: { id: string; name: string; code: string; status: string }
  requestedByUser: { id: string; name: string; email: string; role: string }
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  PARTIAL_APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

const priorityColors: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  MEDIUM: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  URGENT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

interface RequestDetailProps {
  requestId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction: () => void
}

export function RequestDetail({ requestId, open, onOpenChange, onAction }: RequestDetailProps) {
  const user = useAuthStore((s) => s.user)
  const canApprove = user ? hasPermission(user.role, 'inventory_requests', 'approve') : false
  const canReject = user ? hasPermission(user.role, 'inventory_requests', 'reject') : false
  const canComplete = user ? hasPermission(user.role, 'inventory_requests', 'edit') : false

  const [data, setData] = useState<RequestDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Approve dialog
  const [approveOpen, setApproveOpen] = useState(false)

  // Reject dialog
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectRemarks, setRejectRemarks] = useState('')

  // Complete confirmation
  const [completeOpen, setCompleteOpen] = useState(false)

  const fetchData = useCallback(async () => {
    if (!requestId) {
      setData(null)
      return
    }
    setLoading(true)
    try {
      const r = await fetch(`/api/requests/${requestId}`)
      const d = await r.json()
      setData(d.data || null)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    if (!open) return
    fetchData()
  }, [open, fetchData])

  async function handleReject() {
    if (!requestId) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/requests/${requestId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: rejectRemarks }),
      })
      if (res.ok) {
        toast.success('Request rejected')
        setRejectOpen(false)
        onOpenChange(false)
        onAction()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Failed to reject request')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleComplete() {
    if (!requestId) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/requests/${requestId}/complete`, {
        method: 'PUT',
      })
      if (res.ok) {
        toast.success('Request completed — inventory issued')
        setCompleteOpen(false)
        onOpenChange(false)
        onAction()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Failed to complete request')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Detail</DialogTitle>
            <DialogDescription>Full details and actions for the inventory request.</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : data ? (
            <div className="space-y-4">
              {/* Status & Priority */}
              <div className="flex items-center justify-between">
                <Badge className={`${statusColors[data.status] || ''} text-xs font-semibold border-0`}>
                  {data.status.replace(/_/g, ' ')}
                </Badge>
                <Badge className={`${priorityColors[data.priority] || ''} text-xs font-semibold border-0`}>
                  {data.priority}
                </Badge>
              </div>

              {/* Product Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="size-4 text-primary" />
                    Product
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="font-medium">{data.product.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Code / SKU</p>
                      <p className="font-mono font-medium">{data.product.code} / {data.product.sku}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Unit</p>
                      <Badge variant="secondary">{data.product.unit}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Request Info Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Hash className="size-4 text-primary" />
                    Request Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Requested Qty</p>
                      <p className="text-lg font-bold text-primary">
                        {data.quantity} <span className="text-xs font-normal text-muted-foreground">{data.product.unit}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Approved Qty</p>
                      <p className={`text-lg font-bold ${data.approvedQty > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {data.approvedQty > 0 ? (
                          <>{data.approvedQty} <span className="text-xs font-normal text-muted-foreground">{data.product.unit}</span></>
                        ) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Submitted</p>
                      <p className="font-medium">{format(new Date(data.createdAt), 'MMM dd, yyyy')}</p>
                    </div>
                    {(data.approvedAt || data.completedAt) && (
                      <div>
                        <p className="text-xs text-muted-foreground">{data.completedAt ? 'Completed' : 'Approved'}</p>
                        <p className="font-medium">
                          {format(new Date(data.completedAt || data.approvedAt || ''), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Destination Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="size-4 text-primary" />
                    Destination
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Department</p>
                      <p className="font-medium flex items-center gap-1.5">
                        <span className="font-mono text-xs text-muted-foreground">{data.department.code}</span>
                        {data.department.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Project</p>
                      <p className="font-medium flex items-center gap-1.5">
                        <span className="font-mono text-xs text-muted-foreground">{data.project.code}</span>
                        {data.project.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Employee</p>
                      <p className="font-medium flex items-center gap-1.5">
                        <User className="size-3 text-muted-foreground" />
                        {data.employeeName}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Project Status</p>
                      <Badge
                        variant={
                          data.project.status === 'ACTIVE' ? 'default' :
                          data.project.status === 'COMPLETED' ? 'secondary' :
                          data.project.status === 'ON_HOLD' ? 'outline' : 'destructive'
                        }
                      >
                        {data.project.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Requested By Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <User className="size-4 text-primary" />
                    Requested By
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm">
                    <p className="font-medium">{data.requestedByUser.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Mail className="size-3" />
                      {data.requestedByUser.email}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Reason */}
              {data.reason && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <FileText className="size-4 text-primary" />
                      Reason
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{data.reason}</p>
                  </CardContent>
                </Card>
              )}

              {/* Remarks (for rejected) */}
              {data.remarks && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <XCircle className="size-4 text-red-500" />
                      Rejection Remarks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{data.remarks}</p>
                  </CardContent>
                </Card>
              )}

              {/* Action Buttons — Role-based */}
              {data.status === 'PENDING' && (canApprove || canReject) && (
                <div className="flex items-center gap-2 pt-2">
                  {canApprove && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 flex-1"
                      onClick={() => setApproveOpen(true)}
                    >
                      <CheckCircle className="mr-2 size-4" />
                      Approve
                    </Button>
                  )}
                  {canReject && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => { setRejectRemarks(''); setRejectOpen(true) }}
                    >
                      <XCircle className="mr-2 size-4" />
                      Reject
                    </Button>
                  )}
                </div>
              )}

              {(data.status === 'APPROVED' || data.status === 'PARTIAL_APPROVED') && canComplete && (
                <div className="pt-2">
                  <Button
                    size="sm"
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setCompleteOpen(true)}
                  >
                    <CheckCheck className="mr-2 size-4" />
                    Complete & Issue Inventory
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    This will issue {data.approvedQty || data.quantity} {data.product.unit} of {data.product.name} to {data.department.name} — {data.project.name}.
                  </p>
                </div>
              )}

              {/* Timestamp */}
              <p className="text-xs text-muted-foreground text-center pt-2">
                Created: {format(new Date(data.createdAt), "MMM dd, yyyy 'at' HH:mm")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <Package className="size-12 text-muted-foreground/50 mb-4" />
              <p className="text-sm text-muted-foreground">Request not found</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <ApproveDialog
        requestId={requestId}
        open={approveOpen}
        onOpenChange={setApproveOpen}
        onSuccess={onAction}
      />

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="size-5" />
              Reject Request
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this request? Please provide remarks explaining the reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Enter rejection remarks (e.g., insufficient stock, item not available)..."
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
              rows={3}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={actionLoading}
              onClick={handleReject}
            >
              {actionLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Confirmation */}
      <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCheck className="size-5 text-emerald-600" />
              Complete Request
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will issue <strong>{data?.approvedQty || data?.quantity}</strong> {data?.product.unit} of{' '}
              <strong>{data?.product.name}</strong> to <strong>{data?.employeeName}</strong> ({data?.department.name} — {data?.project.name}).
              An inventory transaction will be created automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleComplete}
              disabled={actionLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {actionLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Complete & Issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
