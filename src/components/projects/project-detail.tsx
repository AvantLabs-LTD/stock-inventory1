'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, FolderKanban, Package, Calendar, Building2 } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/stores/app-store'

interface ProjectIssue {
  id: string
  date: string
  quantity: number
  employeeName: string
  remarks: string | null
}

interface ProjectRequest {
  id: string
  createdAt: string
  quantity: number
  approvedQty: number
  employeeName: string
  status: string
}

interface ProjectDetail {
  id: string
  name: string
  code: string
  departmentId: string
  department: { id: string; name: string; code: string; headName: string | null; phone: string | null }
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  _count: { issues: number; requests: number; reservations: number; returns: number }
  issues: ProjectIssue[]
  requests: ProjectRequest[]
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  ON_HOLD: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const requestStatusColor: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  PARTIAL_APPROVED: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export function ProjectDetail() {
  const selectedId = useAppStore((s) => s.selectedProductId)
  const goBack = useAppStore((s) => s.goBack)
  const navigate = useAppStore((s) => s.navigate)
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDetail = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${selectedId}`)
      if (res.ok) {
        const data = await res.json()
        setProject(data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <FolderKanban className="size-12 text-muted-foreground/50 mb-4" />
        <p className="text-lg font-medium">Project not found</p>
        <Button variant="outline" className="mt-4" onClick={goBack}>
          <ArrowLeft className="mr-2 size-4" />
          Back to Projects
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back button and header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl truncate">{project.name}</h1>
            <Badge variant="secondary" className={`text-[10px] ${statusColorMap[project.status] || ''}`}>
              {project.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm text-muted-foreground">{project.code}</p>
            {project.department && (
              <>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={() => navigate('department-detail', project.departmentId)}
                  className="text-sm text-primary hover:underline"
                >
                  {project.department.name}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{project._count.issues}</div>
          <p className="text-xs text-muted-foreground">Issues</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{project._count.requests}</div>
          <p className="text-xs text-muted-foreground">Requests</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{project._count.reservations}</div>
          <p className="text-xs text-muted-foreground">Reservations</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{project._count.returns}</div>
          <p className="text-xs text-muted-foreground">Returns</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Project Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderKanban className="size-4" />
              Project Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Code</span>
              <span className="font-mono font-medium">{project.code}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Department</span>
              <span className="font-medium">{project.department.name}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Head</span>
              <span className="font-medium">{project.department.headName || '—'}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{project.department.phone || '—'}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <Calendar className="size-3" /> Start Date
              </span>
              <span className="font-medium">{project.startDate ? format(new Date(project.startDate), 'MMM dd, yyyy') : '—'}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <Calendar className="size-3" /> End Date
              </span>
              <span className="font-medium">{project.endDate ? format(new Date(project.endDate), 'MMM dd, yyyy') : '—'}</span>
            </div>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{project.description || 'No description'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Recent Issues */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="size-4" />
              Recent Issues ({project.issues.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.issues.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No issues recorded</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {project.issues.map((issue) => (
                  <div key={issue.id} className="flex items-center justify-between rounded-md border p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{issue.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(issue.date), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <Badge variant="secondary" className="font-mono shrink-0 ml-2">
                      {issue.quantity} pcs
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Requests */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4" />
              Recent Requests ({project.requests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.requests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No requests recorded</p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {project.requests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{req.employeeName}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(req.createdAt), 'MMM dd, yyyy')} · {req.quantity} pcs
                        </p>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] shrink-0 ml-2 ${requestStatusColor[req.status] || ''}`}>
                        {req.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
