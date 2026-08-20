'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Building2, Users, FolderKanban, Phone, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/stores/app-store'

interface DeptUser {
  id: string
  name: string
  email: string
  role: string
  status: string
}

interface DeptProject {
  id: string
  name: string
  code: string
  status: string
  startDate: string | null
  endDate: string | null
}

interface DepartmentDetail {
  id: string
  name: string
  code: string
  description: string | null
  headName: string | null
  phone: string | null
  status: string
  users: DeptUser[]
  projects: DeptProject[]
  _count: { users: number; projects: number; reservationRequests: number; reservations: number }
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  INACTIVE: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const projectStatusColor: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  ON_HOLD: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

export function DepartmentDetail() {
  const selectedId = useAppStore((s) => s.selectedEntityId)
  const goBack = useAppStore((s) => s.goBack)
  const navigate = useAppStore((s) => s.navigate)
  const [dept, setDept] = useState<DepartmentDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDetail = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/departments/${selectedId}`)
      if (res.ok) {
        const data = await res.json()
        setDept(data)
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

  if (!dept) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Building2 className="size-12 text-muted-foreground/50 mb-4" />
        <p className="text-lg font-medium">Department not found</p>
        <Button variant="outline" className="mt-4" onClick={goBack}>
          <ArrowLeft className="mr-2 size-4" />
          Back to Departments
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
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{dept.name}</h1>
            <Badge variant="secondary" className={`text-[10px] ${statusColorMap[dept.status] || ''}`}>
              {dept.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{dept.code}</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{dept._count.users}</div>
          <p className="text-xs text-muted-foreground">Users</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{dept._count.projects}</div>
          <p className="text-xs text-muted-foreground">Projects</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{dept._count.reservationRequests}</div>
          <p className="text-xs text-muted-foreground">Requests</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{dept._count.reservations}</div>
          <p className="text-xs text-muted-foreground">Cycles / reservations</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Department Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4" />
              Department Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Code</span>
              <span className="font-mono font-medium">{dept.code}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Head</span>
              <span className="font-medium">{dept.headName || '—'}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{dept.phone || '—'}</span>
            </div>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{dept.description || 'No description'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4" />
              Users ({dept.users.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dept.users.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No users assigned</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {dept.users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-md border p-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserCircle className="size-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {user.role.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projects List */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderKanban className="size-4" />
              Projects ({dept.projects.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dept.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No projects associated</p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {dept.projects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center justify-between rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate('projects', project.id)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground">{project.code}</p>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] shrink-0 ml-2 ${projectStatusColor[project.status] || ''}`}>
                        {project.status}
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
