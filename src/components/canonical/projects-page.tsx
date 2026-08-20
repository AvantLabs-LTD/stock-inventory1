'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, FolderKanban, Loader2, Plus, RefreshCw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'

type Department = { id: string; code: string; name: string }
type Project = { id: string; code: string; name: string; description?: string | null; status: string; department: Department }
type ComponentOption = { id: string; code: string; title: string }
type BomVersion = { id: string; versionNumber: number; fileName: string; status: string; createdAt: string; acceptedAt?: string | null; _count: { lines: number } }
type BomLine = { id: string; sourceLineKey: string; title: string; quantity: string; reconciliationStatus: string; componentId?: string | null; component?: ComponentOption | null }
type BomDetail = BomVersion & { lines: BomLine[] }
type Cycle = { id: string; reservationNo: string; status: string; setCount: number; convertedAt: string; bomVersion?: BomVersion | null; _count: { lines: number; issues: number } }

export function CanonicalProjectsPage() {
  const user = useAuthStore((state) => state.user)
  const requestedProjectId = useAppStore((state) => state.selectedEntityId)
  const canManageBom = Boolean(user && hasPermission(user.role, 'project_bom', 'edit'))
  const canCreateProject = Boolean(user && hasPermission(user.role, 'projects', 'create'))
  const [projects, setProjects] = useState<Project[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [components, setComponents] = useState<ComponentOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [versions, setVersions] = useState<BomVersion[]>([])
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [detail, setDetail] = useState<BomDetail | null>(null)
  const [matches, setMatches] = useState<Record<string, string>>({})
  const [working, setWorking] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [projectForm, setProjectForm] = useState({ name: '', departmentId: '', description: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const loadProjects = useCallback(async () => {
    const [projectResponse, departmentResponse, componentResponse] = await Promise.all([
      fetch('/api/v1/projects?limit=100'), fetch('/api/v1/departments?limit=100'), fetch('/api/v1/components?limit=100'),
    ])
    const [projectBody, departmentBody, componentBody] = await Promise.all([projectResponse.json(), departmentResponse.json(), componentResponse.json()])
    const nextProjects = projectBody.data ?? []
    setProjects(nextProjects)
    setDepartments(departmentBody.data ?? [])
    setComponents(componentBody.data ?? [])
    setSelectedId((current) => requestedProjectId || current || nextProjects[0]?.id || '')
  }, [requestedProjectId])

  const loadProject = useCallback(async () => {
    if (!selectedId) return
    const [versionResponse, cycleResponse] = await Promise.all([
      fetch(`/api/v1/projects/${selectedId}/bom/uploads`),
      fetch(`/api/v1/reservations?projectId=${selectedId}&limit=100`),
    ])
    const [versionBody, cycleBody] = await Promise.all([versionResponse.json(), cycleResponse.json()])
    setVersions(versionBody.data ?? [])
    setCycles(cycleBody.data ?? [])
  }, [selectedId])

  useEffect(() => { void loadProjects() }, [loadProjects])
  useEffect(() => { void loadProject() }, [loadProject])

  async function createProject() {
    setWorking(true)
    const response = await fetch('/api/v1/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectForm) })
    const body = await response.json().catch(() => ({}))
    setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Unable to create project')
    toast.success('Project created')
    setCreateOpen(false)
    setProjectForm({ name: '', departmentId: '', description: '' })
    await loadProjects()
    setSelectedId(body.id)
  }

  async function upload(file: File) {
    const data = new FormData(); data.set('file', file)
    setWorking(true)
    const response = await fetch(`/api/v1/projects/${selectedId}/bom/uploads`, { method: 'POST', body: data })
    const body = await response.json().catch(() => ({}))
    setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'BOM upload failed')
    toast.success(`BOM version ${body.data.versionNumber} staged for reconciliation`)
    await loadProject()
    await openVersion(body.data.id)
  }

  async function openVersion(id: string) {
    const response = await fetch(`/api/v1/projects/${selectedId}/bom/uploads/${id}`)
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return toast.error(body.error ?? 'Unable to load BOM version')
    setDetail(body.data)
  }

  async function reconcile(line: BomLine, create: boolean) {
    setWorking(true)
    const payload = create ? { createComponent: {} } : { componentId: matches[line.id] }
    const response = await fetch(`/api/v1/projects/${selectedId}/bom/uploads/${detail!.id}/lines/${line.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const body = await response.json().catch(() => ({}))
    setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Reconciliation failed')
    toast.success(create ? 'Component created and linked' : 'Component linked')
    await openVersion(detail!.id)
  }

  async function accept() {
    setWorking(true)
    const response = await fetch(`/api/v1/projects/${selectedId}/bom/uploads/${detail!.id}/accept`, { method: 'POST' })
    const body = await response.json().catch(() => ({}))
    setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'BOM acceptance failed')
    toast.success(`BOM version ${detail!.versionNumber} accepted`)
    setDetail(null)
    await loadProject()
  }

  const project = projects.find((item) => item.id === selectedId)
  return <div className="space-y-6">
    <PageHeader title="Projects" description="Immutable BOM versions and independent manufacturing cycles" icon={FolderKanban}>
      <Button variant="outline" size="sm" onClick={() => void loadProject()}><RefreshCw className="mr-2 size-4" />Refresh</Button>
      {canCreateProject && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />New project</Button>}
    </PageHeader>
    <div className="max-w-xl"><Label>Project</Label><Select value={selectedId} onValueChange={setSelectedId}><SelectTrigger className="mt-2"><SelectValue placeholder="Select project" /></SelectTrigger><SelectContent>{projects.map((item) => <SelectItem key={item.id} value={item.id}>{item.code} — {item.name}</SelectItem>)}</SelectContent></Select></div>
    {project && <div><h2 className="text-xl font-medium">{project.name}</h2><p className="text-sm text-muted-foreground">{project.department.name}{project.description ? ` · ${project.description}` : ''}</p></div>}
    <Tabs defaultValue="bom"><TabsList><TabsTrigger value="bom">BOM versions</TabsTrigger><TabsTrigger value="cycles">Manufacturing cycles</TabsTrigger></TabsList><TabsContent value="bom" className="space-y-4"><div className="flex justify-end">{canManageBom && <><input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} /><Button disabled={!selectedId || working} onClick={() => fileRef.current?.click()}><Upload className="mr-2 size-4" />Upload fixed XLSX template</Button></>}</div><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Version</TableHead><TableHead>File</TableHead><TableHead>Status</TableHead><TableHead>Lines</TableHead><TableHead>Uploaded</TableHead><TableHead /></TableRow></TableHeader><TableBody>{versions.map((version) => <TableRow key={version.id}><TableCell>v{version.versionNumber}</TableCell><TableCell>{version.fileName}</TableCell><TableCell><Badge variant="outline">{version.status.replaceAll('_', ' ')}</Badge></TableCell><TableCell>{version._count.lines}</TableCell><TableCell>{new Date(version.createdAt).toLocaleDateString()}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => void openVersion(version.id)}>Inspect</Button></TableCell></TableRow>)}</TableBody></Table></div></TabsContent><TabsContent value="cycles"><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Cycle</TableHead><TableHead>BOM</TableHead><TableHead>Sets</TableHead><TableHead>Status</TableHead><TableHead>Lines</TableHead><TableHead>Issues</TableHead></TableRow></TableHeader><TableBody>{cycles.map((cycle) => <TableRow key={cycle.id}><TableCell className="font-mono text-xs">{cycle.reservationNo}</TableCell><TableCell>{cycle.bomVersion ? `v${cycle.bomVersion.versionNumber}` : '—'}</TableCell><TableCell>{cycle.setCount ?? '—'}</TableCell><TableCell><Badge variant="outline">{cycle.status.replaceAll('_', ' ')}</Badge></TableCell><TableCell>{cycle._count.lines}</TableCell><TableCell>{cycle._count.issues}</TableCell></TableRow>)}</TableBody></Table></div></TabsContent></Tabs>

    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>{detail && `BOM v${detail.versionNumber} — ${detail.fileName}`}</DialogTitle></DialogHeader><div className="space-y-3">{detail?.lines.map((line) => <div key={line.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">{line.sourceLineKey} · {line.title}</div><div className="text-xs text-muted-foreground">Quantity per parent: {line.quantity}</div></div>{line.component ? <Badge variant="secondary"><CheckCircle2 className="mr-1 size-3" />{line.component.code} — {line.component.title}</Badge> : <Badge variant="destructive">Needs reconciliation</Badge>}</div>{canManageBom && detail.status === 'PENDING_RECONCILIATION' && !line.componentId && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Select value={matches[line.id] ?? ''} onValueChange={(componentId) => setMatches({ ...matches, [line.id]: componentId })}><SelectTrigger className="flex-1"><SelectValue placeholder="Match central component" /></SelectTrigger><SelectContent>{components.map((component) => <SelectItem key={component.id} value={component.id}>{component.code} — {component.title}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={!matches[line.id] || working} onClick={() => void reconcile(line, false)}>Link</Button><Button disabled={working} onClick={() => void reconcile(line, true)}>Create component</Button></div>}</div>)}</div><DialogFooter>{canManageBom && detail?.status === 'PENDING_RECONCILIATION' && <Button disabled={working || detail.lines.some((line) => !line.componentId)} onClick={() => void accept()}><CheckCircle2 className="mr-2 size-4" />Accept immutable version</Button>}</DialogFooter></DialogContent></Dialog>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Name</Label><Input value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} /></div><div className="space-y-2"><Label>Department</Label><Select value={projectForm.departmentId} onValueChange={(departmentId) => setProjectForm({ ...projectForm, departmentId })}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.code} — {department.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Description</Label><Textarea value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={working || !projectForm.name || !projectForm.departmentId} onClick={() => void createProject()}>{working && <Loader2 className="mr-2 size-4 animate-spin" />}Create</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
