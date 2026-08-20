'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, Loader2, Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'

type Option = { id: string; name?: string; code: string; title?: string; departmentId?: string }
type RequestLine = { id: string; title: string; quantity: string; componentId: string | null; component?: { title: string } | null }
type ReservationRequest = { id: string; requestNo: string; status: string; createdAt: string; project?: Option | null; department?: Option | null; requestedBy: { name: string }; items: RequestLine[]; reservation?: { id: string; reservationNo: string; status: string } | null }
type BomVersion = { id: string; versionNumber: number; fileName: string; status: string }
type ReservationSummary = { id: string; reservationNo: string; status: string; setCount?: number | null; createdAt: string; project?: Option | null; department?: Option | null; bomVersion?: BomVersion | null; request: { requestedBy: { name: string } }; _count: { lines: number; issues: number } }
type ReservationDetail = ReservationSummary & { lines: Array<{ id: string; component: { title: string; code: string }; targetQuantity: string; allocatedQuantity: string; issuedQuantity: string; remainingQuantity: string; physicalStockDeficit: string; unprocuredDeficit: string; backlogQuantity: string; pendingApprovalQuantity: string; orderedQuantity: string; shippedQuantity: string; fulfilmentFacet: string; availableStock: string; allocatableQuantity: string; readyToAllocate: boolean; blockingDependencies: Array<{ projectComponentId: string; title: string; physicalStockDeficit: string }>; relatedPurchaseRequests: Array<{ purchaseRequestId: string; requestNo: string; status: string }> }>; managerActions: { hasAllocatableStock: boolean; mayIssue: boolean } }

const statusTone: Record<string, string> = { SUBMITTED: 'bg-amber-100 text-amber-800', CONVERTED: 'bg-blue-100 text-blue-800', PENDING: 'bg-amber-100 text-amber-800', IN_PROGRESS: 'bg-violet-100 text-violet-800', AVAILABLE: 'bg-emerald-100 text-emerald-800', PARTIALLY_ISSUED: 'bg-violet-100 text-violet-800', ISSUED: 'bg-slate-100 text-slate-700', CLOSED: 'bg-slate-100 text-slate-700', CANCELLED: 'bg-red-100 text-red-800' }
function Status({ value }: { value: string }) { return <Badge className={`${statusTone[value] ?? ''} border-0`}>{value.replaceAll('_', ' ')}</Badge> }

export function ReservationsPage() {
  const user = useAuthStore((state) => state.user)
  const canManage = Boolean(user && hasPermission(user.role, 'reservations', 'edit'))
  const [tab, setTab] = useState('requests')
  const [requests, setRequests] = useState<ReservationRequest[]>([])
  const [reservations, setReservations] = useState<ReservationSummary[]>([])
  const [components, setComponents] = useState<Option[]>([])
  const [departments, setDepartments] = useState<Option[]>([])
  const [projects, setProjects] = useState<Option[]>([])
  const [projectLines, setProjectLines] = useState<Array<{ id: string; title: string; componentId: string | null }>>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [reservationOpen, setReservationOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<ReservationRequest | null>(null)
  const [detail, setDetail] = useState<ReservationDetail | null>(null)
  const [working, setWorking] = useState(false)
  const [reconcileChoice, setReconcileChoice] = useState<Record<string, string>>({})
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [acceptedBom, setAcceptedBom] = useState<BomVersion | null>(null)
  const [setCount, setSetCount] = useState('1')
  const [form, setForm] = useState({ destination: 'DEPARTMENT', departmentId: '', projectId: '', source: 'EXISTING', componentId: '', projectComponentId: '', title: '', discipline: 'MECHANICAL', description: '', quantity: '1', remarks: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const [requestResponse, reservationResponse] = await Promise.all([fetch('/api/v1/reservation-requests?limit=100'), fetch('/api/v1/reservations?limit=100')])
    const [requestBody, reservationBody] = await Promise.all([requestResponse.json(), reservationResponse.json()])
    if (requestResponse.ok) setRequests(requestBody.data ?? [])
    if (reservationResponse.ok) setReservations(reservationBody.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    Promise.all([fetch('/api/v1/components?limit=100'), fetch('/api/v1/departments'), fetch('/api/v1/projects?limit=100')]).then(async ([c, d, p]) => {
      setComponents((await c.json()).data ?? [])
      setDepartments((await d.json()).data ?? [])
      setProjects((await p.json()).data ?? [])
    }).catch(() => toast.error('Unable to load request options'))
  }, [load])

  useEffect(() => {
    if (!form.projectId) return setProjectLines([])
    fetch(`/api/v1/projects/${form.projectId}/requirements`).then((r) => r.json()).then((body) => setProjectLines(body.data ?? [])).catch(() => setProjectLines([]))
  }, [form.projectId])

  async function submitRequest() {
    const item = form.source === 'PROJECT'
      ? { projectComponentId: form.projectComponentId }
      : form.source === 'EXISTING'
        ? { componentId: form.componentId, quantity: form.quantity, remarks: form.remarks }
        : { title: form.title, discipline: form.discipline, description: form.description, quantity: form.quantity, remarks: form.remarks }
    const payload = { ...(form.destination === 'PROJECT' ? { projectId: form.projectId } : { departmentId: form.departmentId }), items: [item], remarks: form.remarks }
    setWorking(true)
    const response = await fetch('/api/v1/reservation-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const body = await response.json().catch(() => ({})); setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Request could not be submitted')
    toast.success('Reservation request submitted'); setCreateOpen(false); void load()
  }

  async function openRequest(item: ReservationRequest) {
    const response = await fetch(`/api/v1/reservation-requests/${item.id}`); const body = await response.json()
    setSelectedRequest(body.data)
    setAcceptedBom(null)
    setSetCount('1')
    if (body.data?.project?.id) {
      const bomResponse = await fetch(`/api/v1/projects/${body.data.project.id}/bom/uploads`)
      const bomBody = await bomResponse.json().catch(() => ({}))
      setAcceptedBom((bomBody.data ?? []).find((version: BomVersion) => version.status === 'ACCEPTED') ?? null)
    }
    setRequestOpen(true)
  }

  async function reconcile(line: RequestLine, create: boolean) {
    setWorking(true)
    const payload = create ? { createComponent: {} } : { componentId: reconcileChoice[line.id] }
    const response = await fetch(`/api/v1/reservation-requests/${selectedRequest!.id}/lines/${line.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const body = await response.json().catch(() => ({})); setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Reconciliation failed')
    toast.success(create ? 'Component created and linked' : 'Component linked'); await openRequest(selectedRequest!); void load()
  }

  async function convert() {
    setWorking(true)
    const cycleInput = selectedRequest!.project
      ? { bomVersionId: acceptedBom?.id, setCount: Number(setCount) }
      : {}
    const response = await fetch(`/api/v1/reservation-requests/${selectedRequest!.id}/convert`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cycleInput),
    })
    const body = await response.json().catch(() => ({})); setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Conversion failed')
    toast.success('Request converted to reservation'); setRequestOpen(false); setTab('reservations'); void load()
  }

  async function openReservation(id: string) {
    const response = await fetch(`/api/v1/reservations/${id}`); const body = await response.json()
    if (!response.ok) return toast.error(body.error ?? 'Unable to load reservation')
    setDetail(body.data); setReservationOpen(true)
  }

  async function lineAction(lineId: string, action: 'allocate' | 'release' | 'issue' | 'cancel') {
    const quantity = quantities[lineId]
    if (!quantity) return toast.error('Enter a quantity')
    const reason = action === 'cancel' ? window.prompt('Reason for cancelling this quantity:')?.trim() : undefined
    if (action === 'cancel' && !reason) return
    const url = action === 'allocate'
      ? `/api/v1/reservations/${detail!.id}/lines/${lineId}/allocations`
      : action === 'release'
        ? `/api/v1/reservations/${detail!.id}/lines/${lineId}/releases`
        : action === 'cancel'
          ? `/api/v1/reservations/${detail!.id}/lines/${lineId}/cancellations`
          : `/api/v1/reservations/${detail!.id}/issues`
    const payload = action === 'issue' ? { lines: [{ reservationLineId: lineId, quantity }] } : { quantity, ...(reason ? { reason } : {}) }
    setWorking(true)
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const body = await response.json().catch(() => ({})); setWorking(false)
    if (!response.ok) return toast.error(body.error ?? `${action} failed`)
    const messages = { allocate: 'Stock allocated', release: 'Allocation released', issue: 'Partial issue posted', cancel: 'Requirement quantity cancelled' }
    toast.success(messages[action]); await openReservation(detail!.id); void load()
  }

  async function cancelCycle() {
    if (!detail || detail.status === 'CANCELLED') return
    const reason = window.prompt('Reason for cancelling this entire cycle or reservation:')?.trim()
    if (!reason || !window.confirm(`Cancel ${detail.reservationNo}? Allocations will be released; posted issues remain immutable.`)) return
    setWorking(true)
    const response = await fetch(`/api/v1/reservations/${detail.id}/cancellation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
    const body = await response.json().catch(() => ({})); setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Cancellation failed')
    toast.success('Reservation cancelled and active allocations released'); await openReservation(detail.id); void load()
  }

  return <div className="space-y-6">
    <PageHeader title="Reservations" description="Submit requests, reconcile descriptions, allocate stock, and issue partial quantities" icon={ClipboardCheck}>
      <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 size-4" />Refresh</Button>
      <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />New request</Button>
    </PageHeader>
    <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="requests">Requests</TabsTrigger><TabsTrigger value="reservations">Reservations</TabsTrigger></TabsList></Tabs>
    <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Destination</TableHead><TableHead>Requested by</TableHead><TableHead>Status</TableHead><TableHead>Lines</TableHead><TableHead /></TableRow></TableHeader><TableBody>
      {loading ? <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></TableCell></TableRow> : tab === 'requests' ? requests.map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{item.requestNo}</TableCell><TableCell>{item.project?.name ?? item.department?.name}</TableCell><TableCell>{item.requestedBy.name}</TableCell><TableCell><Status value={item.status} /></TableCell><TableCell>{item.items.length}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => void openRequest(item)}>Open</Button></TableCell></TableRow>) : reservations.map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{item.reservationNo}</TableCell><TableCell>{item.project?.name ?? item.department?.name}{item.bomVersion && <div className="text-xs text-muted-foreground">BOM v{item.bomVersion.versionNumber} · {item.setCount} sets</div>}</TableCell><TableCell>{item.request.requestedBy.name}</TableCell><TableCell><Status value={item.status} /></TableCell><TableCell>{item._count.lines}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => void openReservation(item.id)}>Open</Button></TableCell></TableRow>)}
    </TableBody></Table></div>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>New reservation request</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label>Destination type</Label><Select value={form.destination} onValueChange={(destination) => setForm({ ...form, destination, source: destination === 'PROJECT' ? 'PROJECT' : 'EXISTING' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DEPARTMENT">Department</SelectItem><SelectItem value="PROJECT">Project</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label>Destination</Label>{form.destination === 'PROJECT' ? <Select value={form.projectId} onValueChange={(projectId) => setForm({ ...form, projectId })}><SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger><SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent></Select> : <Select value={form.departmentId} onValueChange={(departmentId) => setForm({ ...form, departmentId })}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>)}</SelectContent></Select>}</div>
      {form.destination !== 'PROJECT' && <div className="space-y-2 sm:col-span-2"><Label>Item source</Label><Select value={form.source} onValueChange={(source) => setForm({ ...form, source })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EXISTING">Existing store component</SelectItem><SelectItem value="NEW">Describe a component for reconciliation</SelectItem></SelectContent></Select></div>}
      {form.source === 'PROJECT' ? <div className="space-y-2 sm:col-span-2"><Label>Project BOM component</Label><Select value={form.projectComponentId} onValueChange={(projectComponentId) => setForm({ ...form, projectComponentId })}><SelectTrigger><SelectValue placeholder="Select BOM line" /></SelectTrigger><SelectContent>{projectLines.map((line) => <SelectItem key={line.id} value={line.id}>{line.title}{!line.componentId ? ' (unreconciled)' : ''}</SelectItem>)}</SelectContent></Select></div> : form.source === 'EXISTING' ? <div className="space-y-2 sm:col-span-2"><Label>Store component</Label><Select value={form.componentId} onValueChange={(componentId) => setForm({ ...form, componentId })}><SelectTrigger><SelectValue placeholder="Select component" /></SelectTrigger><SelectContent>{components.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>)}</SelectContent></Select></div> : <><div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div><div className="space-y-2"><Label>Category</Label><Select value={form.discipline} onValueChange={(discipline) => setForm({ ...form, discipline })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MECHANICAL">Mechanical</SelectItem><SelectItem value="ELECTRONICS">Electronics</SelectItem></SelectContent></Select></div><div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div></>}
      {form.source !== 'PROJECT' && <div className="space-y-2"><Label>Quantity</Label><Input type="number" min="0.000001" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>}
      <div className="space-y-2 sm:col-span-2"><Label>Remarks (optional)</Label><Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={working} onClick={() => void submitRequest()}>{working && <Loader2 className="mr-2 size-4 animate-spin" />}Submit</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={requestOpen} onOpenChange={setRequestOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{selectedRequest?.requestNo}</DialogTitle></DialogHeader><div className="space-y-3">{selectedRequest?.items.map((line) => <div key={line.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{line.title}</div><div className="text-sm text-muted-foreground">Quantity: {line.quantity}</div></div>{line.componentId ? <Badge variant="secondary">Linked: {line.component?.title}</Badge> : <Badge variant="destructive">Needs reconciliation</Badge>}</div>{canManage && selectedRequest.status === 'SUBMITTED' && !line.componentId && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Select value={reconcileChoice[line.id] ?? ''} onValueChange={(value) => setReconcileChoice({ ...reconcileChoice, [line.id]: value })}><SelectTrigger className="flex-1"><SelectValue placeholder="Match existing component" /></SelectTrigger><SelectContent>{components.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={!reconcileChoice[line.id] || working} onClick={() => void reconcile(line, false)}>Link</Button><Button disabled={working} onClick={() => void reconcile(line, true)}>Create new</Button></div>}</div>)}{selectedRequest?.project && <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"><div><Label>Accepted BOM version</Label><div className="mt-2 text-sm">{acceptedBom ? `Version ${acceptedBom.versionNumber} — ${acceptedBom.fileName}` : 'No accepted BOM is available'}</div></div><div><Label>Manufacturing sets</Label><Input className="mt-2" type="number" min="1" step="1" value={setCount} onChange={(event) => setSetCount(event.target.value)} /></div></div>}</div><DialogFooter>{canManage && selectedRequest?.status === 'SUBMITTED' && <Button disabled={working || selectedRequest.items.some((line) => !line.componentId) || Boolean(selectedRequest.project && (!acceptedBom || Number(setCount) < 1))} onClick={() => void convert()}><ShieldCheck className="mr-2 size-4" />{selectedRequest.project ? 'Create manufacturing cycle' : 'Convert to reservation'}</Button>}</DialogFooter></DialogContent></Dialog>

    <Dialog open={reservationOpen} onOpenChange={setReservationOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>{detail?.reservationNo} · {detail && <Status value={detail.status} />}{detail?.bomVersion && <span className="ml-2 text-sm font-normal text-muted-foreground">BOM v{detail.bomVersion.versionNumber} · {detail.setCount} sets</span>}</DialogTitle></DialogHeader><div className="space-y-3">{detail?.lines.map((line) => <div key={line.id} className="rounded-lg border p-4"><div className="grid gap-3 sm:grid-cols-8"><div className="sm:col-span-2"><div className="font-medium">{line.component.title}</div><div className="font-mono text-xs text-muted-foreground">{line.component.code}</div><Status value={line.fulfilmentFacet} /></div><Metric label="Required" value={line.targetQuantity} /><Metric label="Allocated" value={line.allocatedQuantity} /><Metric label="Issued" value={line.issuedQuantity} /><Metric label="Remaining" value={line.remainingQuantity} /><Metric label="Physical deficit" value={line.physicalStockDeficit} /><Metric label="Unprocured" value={line.unprocuredDeficit} /></div><div className="mt-2 text-xs text-muted-foreground">Procurement: backlog {line.backlogQuantity} · approval {line.pendingApprovalQuantity} · ordered {line.orderedQuantity} · shipped {line.shippedQuantity}</div>{line.blockingDependencies.length > 0 && <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><strong>Blocked by:</strong> {line.blockingDependencies.map((b) => `${b.title} (${b.physicalStockDeficit})`).join(', ')}</div>}{line.relatedPurchaseRequests.length > 0 && <div className="mt-2 text-xs text-muted-foreground">Purchasing: {line.relatedPurchaseRequests.map((p) => `${p.requestNo} — ${p.status.replaceAll('_', ' ')}`).join(', ')}</div>}{canManage && detail.status !== 'CANCELLED' && <div className="mt-3 flex flex-wrap gap-2"><Input className="w-36" type="number" step="any" min="0.000001" placeholder="Quantity" value={quantities[line.id] ?? ''} onChange={(e) => setQuantities({ ...quantities, [line.id]: e.target.value })} /><Button variant="outline" disabled={working || !line.readyToAllocate} onClick={() => void lineAction(line.id, 'allocate')}>Allocate (max {line.allocatableQuantity})</Button><Button variant="outline" disabled={working || Number(line.allocatedQuantity) <= 0} onClick={() => void lineAction(line.id, 'release')}>Release</Button><Button disabled={working || Number(line.allocatedQuantity) <= 0} onClick={() => void lineAction(line.id, 'issue')}>Issue partial</Button><Button variant="destructive" disabled={working || Number(line.remainingQuantity) <= 0} onClick={() => void lineAction(line.id, 'cancel')}>Cancel quantity</Button></div>}</div>)}</div>{canManage && detail?.status !== 'CANCELLED' && <DialogFooter><Button variant="destructive" disabled={working} onClick={() => void cancelCycle()}>Cancel entire reservation</Button></DialogFooter>}</DialogContent></Dialog>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold tabular-nums">{value}</div></div> }
