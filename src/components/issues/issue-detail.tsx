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
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface IssueDetailData {
  id: string
  productId: string
  departmentId: string
  projectId: string
  issuedBy: string
  employeeName: string
  quantity: number
  remarks: string | null
  date: string
  createdAt: string
  product: { id: string; name: string; code: string; sku: string; unit: string }
  department: { id: string; name: string; code: string }
  project: { id: string; name: string; code: string; status: string }
  issuedByUser: { id: string; name: string; email: string }
}

interface IssueDetailProps {
  issueId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function IssueDetail({ issueId, open, onOpenChange }: IssueDetailProps) {
  const [data, setData] = useState<IssueDetailData | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (!issueId) {
      setData(null)
      return
    }
    setLoading(true)
    try {
      const r = await fetch(`/api/issues/${issueId}`)
      const d = await r.json()
      setData(d.data || null)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [issueId])

  useEffect(() => {
    if (!open) return
    fetchData()
  }, [open, fetchData])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Issue Detail</DialogTitle>
          <DialogDescription>Full details of the inventory issue.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-4">
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
                    <p className="text-xs text-muted-foreground">Code</p>
                    <p className="font-mono font-medium">{data.product.code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">SKU</p>
                    <p className="font-mono text-sm">{data.product.sku}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unit</p>
                    <Badge variant="secondary">{data.product.unit}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Issue Info Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Hash className="size-4 text-primary" />
                  Issue Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className="text-lg font-bold text-primary">
                      {data.quantity} <span className="text-xs font-normal text-muted-foreground">{data.product.unit}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="font-medium">{format(new Date(data.date), 'MMM dd, yyyy')}</p>
                  </div>
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

            {/* Issued By Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="size-4 text-primary" />
                  Issued By
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <p className="font-medium">{data.issuedByUser.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Mail className="size-3" />
                    {data.issuedByUser.email}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Remarks */}
            {data.remarks && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    Remarks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{data.remarks}</p>
                </CardContent>
              </Card>
            )}

            {/* Timestamp */}
            <p className="text-xs text-muted-foreground text-center pt-2">
              Created: {format(new Date(data.createdAt), "MMM dd, yyyy 'at' HH:mm")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <Package className="size-12 text-muted-foreground/50 mb-4" />
            <p className="text-sm text-muted-foreground">Issue not found</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
