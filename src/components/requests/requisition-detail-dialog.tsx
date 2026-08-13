'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Package,
  Building2,
  FolderKanban,
  User,
  FileText,
  Mail,
  CheckCircle,
  XCircle,
  CheckCheck,
  Loader2,
  PenLine,
  Hash,
  CalendarDays,
  Warehouse,
  Truck,
  PackageCheck,
  PackageX,
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
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockInfo {
  totalInStock: number
  totalIssued: number
  totalReserved: number
  availableInStore: number
}

interface RequisitionItemData {
  id: string
  productId: string
  specDescription: string | null
  requiredQty: number
  issuedQty: number
  remarks: string | null
  product: { id: string; name: string; code: string; sku: string; unit: string }
  stockInfo?: StockInfo
}

interface RequisitionData {
  id: string
  requisitionNo: string
  date: string
  departmentId: string
  projectId: string
  requestedBy: string
  employeeName: string
  issuedByName: string | null
  receivedByName: string | null
  approvedBy: string | null
  approvedAt: string | null
  completedBy: string | null
  completedAt: string | null
  status: string
  remarks: string | null
  createdAt: string
  updatedAt: string
  department: { id: string; name: string; code: string }
  project: { id: string; name: string; code: string }
  requestedByUser: { id: string; name: string; email: string }
  items: RequisitionItemData[]
}

// ─── Status Colors ──────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  PARTIAL_APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CLOSED: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  requisitionId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RequisitionDetailDialog({ requisitionId, open, onOpenChange, onAction }: Props) {
  const user = useAuthStore((s) => s.user)
  const canApprove = user ? hasPermission(user.role, 'inventory_requests', 'approve') : false
  const canReject = user ? hasPermission(user.role, 'inventory_requests', 'reject') : false
  const canEdit = user ? hasPermission(user.role, 'inventory_requests', 'edit') : false

  const [data, setData] = useState<RequisitionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Approve
  const [approveOpen, setApproveOpen] = useState(false)
  const [approveQtys, setApproveQtys] = useState<Record<string, number>>({})

  // Reject
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectRemarks, setRejectRemarks] = useState('')

  // Complete
  const [completeOpen, setCompleteOpen] = useState(false)

  // Edit signature
  const [editIssuedBy, setEditIssuedBy] = useState(false)
  const [editReceivedBy, setEditReceivedBy] = useState(false)
  const [issuedByName, setIssuedByName] = useState('')
  const [receivedByName, setReceivedByName] = useState('')
  const [savingSignatures, setSavingSignatures] = useState(false)

  // ─── Fetch ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!requisitionId) { setData(null); return }
    setLoading(true)
    try {
      const r = await fetch(`/api/requisitions/${requisitionId}`)
      const d = await r.json()
      setData(d.data || null)
      if (d.data) {
        setIssuedByName(d.data.issuedByName || '')
        setReceivedByName(d.data.receivedByName || '')
      }
    } catch { setData(null) } finally { setLoading(false) }
  }, [requisitionId])

  useEffect(() => {
    if (!open) return
    setEditIssuedBy(false)
    setEditReceivedBy(false)
    fetchData()
  }, [open, fetchData])

  // ─── Approve ─────────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!requisitionId || !data) return
    setActionLoading(true)
    try {
      const itemsPayload = data.items.map((item) => ({
        itemId: item.id,
        approvedQty: approveQtys[item.id] ?? item.requiredQty,
      }))
      const res = await fetch(`/api/requisitions/${requisitionId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsPayload }),
      })
      if (res.ok) {
        toast.success('Requisition approved')
        setApproveOpen(false)
        onOpenChange(false)
        onAction()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Failed to approve')
      }
    } catch { toast.error('Network error') } finally { setActionLoading(false) }
  }

  // ─── Reject ──────────────────────────────────────────────────────────────
  async function handleReject() {
    if (!requisitionId) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/requisitions/${requisitionId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: rejectRemarks }),
      })
      if (res.ok) {
        toast.success('Requisition rejected')
        setRejectOpen(false)
        onOpenChange(false)
        onAction()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Failed to reject')
      }
    } catch { toast.error('Network error') } finally { setActionLoading(false) }
  }

  // ─── Complete (Issue & Close) ───────────────────────────────────────────
  async function handleComplete() {
    if (!requisitionId) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/requisitions/${requisitionId}/complete`, { method: 'PUT' })
      if (res.ok) {
        toast.success('Requisition closed — inventory issued & stock updated')
        setCompleteOpen(false)
        onOpenChange(false)
        onAction()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Failed to complete')
      }
    } catch { toast.error('Network error') } finally { setActionLoading(false) }
  }

  // ─── Save Signatures ────────────────────────────────────────────────────
  async function handleSaveSignatures() {
    if (!requisitionId) return
    setSavingSignatures(true)
    try {
      const res = await fetch(`/api/requisitions/${requisitionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issuedByName: issuedByName || null, receivedByName: receivedByName || null }),
      })
      if (res.ok) {
        toast.success('Signatures updated')
        setEditIssuedBy(false)
        setEditReceivedBy(false)
        fetchData()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Failed to update')
      }
    } catch { toast.error('Network error') } finally { setSavingSignatures(false) }
  }

  const openApproveDialog = () => {
    if (!data) return
    const init: Record<string, number> = {}
    data.items.forEach((item) => { init[item.id] = item.requiredQty })
    setApproveQtys(init)
    setApproveOpen(true)
  }

  const isClosed = data?.status === 'CLOSED' || data?.status === 'COMPLETED'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-center font-bold tracking-wider uppercase flex items-center justify-center gap-2">
              <FileText className="size-5" />
              Material Requisition
            </DialogTitle>
            <DialogDescription className="text-center">
              {data?.requisitionNo && (
                <span className="font-mono font-semibold text-foreground">{data.requisitionNo}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex-1 overflow-y-auto space-y-4 p-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-60 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : data ? (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* ─── Status Row ──────────────────────────────────────────── */}
              <div className="flex items-center justify-between px-1">
                <Badge className={`${statusColors[data.status] || statusColors.CANCELLED} text-xs font-semibold border-0 px-3 py-1`}>
                  {data.status === 'CLOSED' ? 'Closed' : data.status.replace(/_/g, ' ')}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(data.date), 'dd-MMM-yy')}
                </span>
              </div>

              {/* ─── Header Info ─────────────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border rounded-lg bg-muted/30 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Department</p>
                  <p className="font-medium mt-0.5">{data.department.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{data.department.code}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Project</p>
                  <p className="font-medium mt-0.5">{data.project.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{data.project.code}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Employee</p>
                  <p className="font-medium mt-0.5 flex items-center gap-1">
                    <User className="size-3 text-muted-foreground" />
                    {data.employeeName}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Requested By</p>
                  <p className="font-medium mt-0.5">{data.requestedByUser.name}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Mail className="size-2.5" /> {data.requestedByUser.email}
                  </p>
                </div>
              </div>

              {/* ─── Items Table with Stock Info ──────────────────────────── */}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[50px] text-center font-semibold">S/No</TableHead>
                        <TableHead className="font-semibold min-w-[160px]">Item Name</TableHead>
                        <TableHead className="font-semibold">Item ID</TableHead>
                        <TableHead className="font-semibold">Spec</TableHead>
                        <TableHead className="w-[90px] text-center font-semibold">Req Qty</TableHead>
                        <TableHead className="w-[90px] text-center font-semibold">Issued</TableHead>
                        <TableHead className="w-[90px] text-center font-semibold">In Stock</TableHead>
                        <TableHead className="w-[90px] text-center font-semibold">Ordered</TableHead>
                        <TableHead className="w-[90px] text-center font-semibold">Left</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.items.map((item, idx) => {
                        const stock = item.stockInfo
                        const allIssued = item.issuedQty >= item.requiredQty
                        const partialIssued = item.issuedQty > 0 && !allIssued

                        return (
                          <TableRow key={item.id}>
                            <TableCell className="text-center font-mono text-sm text-muted-foreground">
                              {idx + 1}
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-sm">{item.product.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{item.product.code}</p>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {item.product.sku || item.product.code}
                            </TableCell>
                            <TableCell className="text-sm">
                              {item.specDescription || '—'}
                            </TableCell>
                            <TableCell className="text-center font-semibold text-sm">
                              {item.requiredQty} <span className="text-[10px] font-normal text-muted-foreground">{item.product.unit}</span>
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {item.issuedQty > 0 ? (
                                <span className="font-semibold text-green-600 dark:text-green-400">
                                  {item.issuedQty}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              <span className="flex items-center justify-center gap-1">
                                <Warehouse className="size-3 text-muted-foreground" />
                                <span className="font-medium">{stock?.totalInStock ?? '—'}</span>
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              <span className="flex items-center justify-center gap-1">
                                <Truck className="size-3 text-muted-foreground" />
                                <span className="font-medium">{stock?.totalIssued ?? '—'}</span>
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              <span className={`font-semibold ${
                                (stock?.availableInStore ?? 0) > item.requiredQty ? 'text-green-600 dark:text-green-400' :
                                (stock?.availableInStore ?? 0) === 0 ? 'text-red-600 dark:text-red-400' :
                                'text-amber-600 dark:text-amber-400'
                              }`}>
                                {stock?.availableInStore ?? '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {isClosed ? (
                                <Badge className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 text-[10px] border-0 font-semibold px-2">
                                  Closed
                                </Badge>
                              ) : allIssued ? (
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] border-0 font-semibold px-2 flex items-center justify-center gap-0.5 w-fit mx-auto">
                                  <PackageCheck className="size-3" />
                                  Fulfilled
                                </Badge>
                              ) : partialIssued ? (
                                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] border-0 font-semibold px-2">
                                  Partial
                                </Badge>
                              ) : (
                                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] border-0 font-semibold px-2">
                                  Pending
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* ─── Rejection Remarks ────────────────────────────────────── */}
              {data.status === 'REJECTED' && data.remarks && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-3">
                  <p className="text-xs font-semibold text-red-600 flex items-center gap-1 mb-1">
                    <XCircle className="size-3" /> Rejection Reason
                  </p>
                  <p className="text-sm text-red-800 dark:text-red-300">{data.remarks}</p>
                </div>
              )}

              {/* ─── Closed Banner ─────────────────────────────────────────── */}
              {isClosed && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 p-3 flex items-center gap-2">
                  <CheckCheck className="size-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Requisition Closed</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500">
                      All items have been issued. Stock has been automatically deducted.
                      {data.completedAt && ` Closed: ${format(new Date(data.completedAt), "MMM dd, yyyy 'at' HH:mm")}`}
                    </p>
                  </div>
                </div>
              )}

              {/* ─── Issued By / Received By (Signature Sections) ─────────── */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border-2 border-dashed rounded-lg p-4 min-h-[100px]">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                      Issued By
                    </Label>
                    {(data.status === 'APPROVED' || data.status === 'PARTIAL_APPROVED' || isClosed) && canEdit && !editIssuedBy && (
                      <Button variant="ghost" size="icon" className="size-6" onClick={() => setEditIssuedBy(true)}>
                        <PenLine className="size-3" />
                      </Button>
                    )}
                  </div>
                  {editIssuedBy ? (
                    <div className="flex gap-2">
                      <Input
                        value={issuedByName}
                        onChange={(e) => setIssuedByName(e.target.value)}
                        placeholder="Enter issuer name"
                        className="h-8"
                        autoFocus
                      />
                      <Button size="sm" className="h-8" onClick={handleSaveSignatures} disabled={savingSignatures}>
                        {savingSignatures ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-lg font-semibold mt-4">
                      {data.issuedByName || (
                        <span className="text-muted-foreground font-normal text-base italic">Signature / Name</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="border-2 border-dashed rounded-lg p-4 min-h-[100px]">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                      Received By
                    </Label>
                    {(data.status === 'APPROVED' || data.status === 'PARTIAL_APPROVED' || isClosed) && canEdit && !editReceivedBy && (
                      <Button variant="ghost" size="icon" className="size-6" onClick={() => setEditReceivedBy(true)}>
                        <PenLine className="size-3" />
                      </Button>
                    )}
                  </div>
                  {editReceivedBy ? (
                    <div className="flex gap-2">
                      <Input
                        value={receivedByName}
                        onChange={(e) => setReceivedByName(e.target.value)}
                        placeholder="Enter receiver name"
                        className="h-8"
                        autoFocus
                      />
                      <Button size="sm" className="h-8" onClick={handleSaveSignatures} disabled={savingSignatures}>
                        {savingSignatures ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-lg font-semibold mt-4">
                      {data.receivedByName || (
                        <span className="text-muted-foreground font-normal text-base italic">Signature / Name</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* ─── Action Buttons ────────────────────────────────────────── */}
              {data.status === 'PENDING' && (canApprove || canReject) && (
                <div className="flex items-center gap-2 pt-2">
                  {canApprove && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 flex-1" onClick={openApproveDialog}>
                      <CheckCircle className="mr-2 size-4" /> Approve
                    </Button>
                  )}
                  {canReject && (
                    <Button size="sm" variant="destructive" className="flex-1" onClick={() => { setRejectRemarks(''); setRejectOpen(true) }}>
                      <XCircle className="mr-2 size-4" /> Reject
                    </Button>
                  )}
                </div>
              )}

              {(data.status === 'APPROVED' || data.status === 'PARTIAL_APPROVED') && canEdit && (
                <div className="pt-2">
                  <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setCompleteOpen(true)}>
                    <CheckCheck className="mr-2 size-4" /> Complete & Issue Inventory
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    This will issue all approved items to {data.department.name} — {data.project.name} and automatically deduct stock.
                  </p>
                </div>
              )}

              {/* ─── Timestamp ─────────────────────────────────────────────── */}
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                Created: {format(new Date(data.createdAt), "MMM dd, yyyy 'at' HH:mm")}
                {data.approvedAt && ` · Approved: ${format(new Date(data.approvedAt), "MMM dd, yyyy 'at' HH:mm")}`}
                {data.completedAt && ` · Closed: ${format(new Date(data.completedAt), "MMM dd, yyyy 'at' HH:mm")}`}
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <FileText className="size-12 text-muted-foreground/50 mb-4" />
              <p className="text-sm text-muted-foreground">Requisition not found</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Approve Dialog ────────────────────────────────────────────────── */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="size-5" /> Approve Requisition
            </DialogTitle>
            <DialogDescription>
              Review and adjust quantities for each item before approving.
            </DialogDescription>
          </DialogHeader>
          {data && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Item</TableHead>
                    <TableHead className="text-center">Requested</TableHead>
                    <TableHead className="text-center">Approve Qty</TableHead>
                    <TableHead className="text-center">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">{item.product.name}</TableCell>
                      <TableCell className="text-center text-sm font-medium">{item.requiredQty} {item.product.unit}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          className="w-24 h-8 text-center mx-auto"
                          min={0}
                          max={item.requiredQty}
                          value={approveQtys[item.id] ?? item.requiredQty}
                          onChange={(e) =>
                            setApproveQtys((prev) => ({
                              ...prev,
                              [item.id]: Math.min(Number(e.target.value) || 0, item.requiredQty),
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell className="text-center text-sm font-medium">
                        <span className={
                          (item.stockInfo?.availableInStore ?? 0) >= item.requiredQty
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }>
                          {item.stockInfo?.availableInStore ?? '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" disabled={actionLoading} onClick={handleApprove}>
              {actionLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reject Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="size-5" /> Reject Requisition
            </DialogTitle>
            <DialogDescription>Provide a reason for rejecting this requisition.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectRemarks}
            onChange={(e) => setRejectRemarks(e.target.value)}
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={actionLoading} onClick={handleReject}>
              {actionLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Complete Confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCheck className="size-5 text-emerald-600" /> Complete Requisition
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will issue all approved items to <strong>{data?.department.name}</strong> — <strong>{data?.project.name}</strong>.<br />
              Inventory will be automatically deducted from Stock.
              The requisition will be marked as <strong>Closed</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
              {actionLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Complete & Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
