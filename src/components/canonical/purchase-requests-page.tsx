'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileUp, Loader2, Plus, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'

type ComponentOption = { id: string; code: string; title: string }
type PurchaseLine = { id: string; componentId: string; component: ComponentOption; type: string; quantity: string; receivedQuantity?: string; receiptLines: Array<{ quantity: string }>; reservationLinks: Array<{ id: string; quantity: string; reservationLine: { reservation: { reservationNo: string } } }> }
type Purchase = { id: string; requestNo: string; status: string; provider?: string | null; trackingNumber?: string | null; boxNumber?: string | null; remarks?: string | null; createdAt: string; createdBy: { name: string }; approvedBy?: { name: string } | null; lines: PurchaseLine[]; attachments?: Array<{ id: string; fileName: string; kind: string; sizeBytes: number }>; receipts?: Array<{ id: string; receiptNo: string }> }
type Deficit = { componentId: string; deficitQuantity: string; component: ComponentOption }

const statusTone: Record<string, string> = { BACKLOG: 'bg-slate-100 text-slate-800', PENDING_ORDER_APPROVAL: 'bg-amber-100 text-amber-800', ORDERED: 'bg-blue-100 text-blue-800', SHIPPED: 'bg-violet-100 text-violet-800', RECEIVED_IN_STORE: 'bg-emerald-100 text-emerald-800' }
function Status({ value }: { value: string }) { return <Badge className={`${statusTone[value] ?? ''} border-0`}>{value.replaceAll('_', ' ')}</Badge> }

export function PurchaseRequestsPage() {
  const user = useAuthStore((state) => state.user)
  const canManage = Boolean(user && hasPermission(user.role, 'purchase_requests', 'manage'))
  const canApprove = Boolean(user && hasPermission(user.role, 'purchase_requests', 'approve'))
  const canReceive = Boolean(user && hasPermission(user.role, 'purchase_requests', 'receive'))
  const [items, setItems] = useState<Purchase[]>([])
  const [components, setComponents] = useState<ComponentOption[]>([])
  const [deficits, setDeficits] = useState<Deficit[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<Purchase | null>(null)
  const [form, setForm] = useState({ componentId: '', type: 'LOCAL_STANDARD', quantity: '1', remarks: '' })
  const [shipping, setShipping] = useState({ provider: '', trackingNumber: '', boxNumber: '', remarks: '' })
  const [receiptQty, setReceiptQty] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const deficitByComponent = useMemo(() => {
    const result = new Map<string, number>()
    for (const item of deficits) result.set(item.componentId, (result.get(item.componentId) ?? 0) + Number(item.deficitQuantity))
    return result
  }, [deficits])

  const load = useCallback(async () => {
    setLoading(true)
    const [requests, componentResponse, deficitResponse] = await Promise.all([fetch('/api/v1/purchase-requests?limit=100'), fetch('/api/v1/components?limit=100'), fetch('/api/v1/reservations/deficits')])
    const [requestBody, componentBody, deficitBody] = await Promise.all([requests.json(), componentResponse.json(), deficitResponse.json()])
    if (requests.ok) setItems(requestBody.data ?? [])
    if (componentResponse.ok) setComponents(componentBody.data ?? [])
    if (deficitResponse.ok) setDeficits(deficitBody.data ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function create() {
    setWorking(true)
    const response = await fetch('/api/v1/purchase-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remarks: form.remarks, lines: [{ ...form }] }) })
    const body = await response.json().catch(() => ({})); setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Unable to create purchase request')
    toast.success('Purchase request created with reservation links'); setCreateOpen(false); void load(); void openDetail(body.data.id)
  }

  async function openDetail(id: string) {
    const response = await fetch(`/api/v1/purchase-requests/${id}`); const body = await response.json()
    if (!response.ok) return toast.error(body.error ?? 'Unable to load purchase request')
    setDetail(body.data); setShipping({ provider: body.data.provider ?? '', trackingNumber: body.data.trackingNumber ?? '', boxNumber: body.data.boxNumber ?? '', remarks: body.data.remarks ?? '' }); setDetailOpen(true)
  }

  async function transition(status: string) {
    setWorking(true)
    const response = await fetch(`/api/v1/purchase-requests/${detail!.id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    const body = await response.json().catch(() => ({})); setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Transition failed')
    toast.success(`Purchase request moved to ${status.replaceAll('_', ' ')}`); await openDetail(detail!.id); void load()
  }

  async function saveShipping() {
    setWorking(true)
    const response = await fetch(`/api/v1/purchase-requests/${detail!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shipping) })
    const body = await response.json().catch(() => ({})); setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Unable to save shipping details')
    toast.success('Shipping details saved'); await openDetail(detail!.id)
  }

  async function unlink(linkId: string) {
    const response = await fetch(`/api/v1/purchase-requests/${detail!.id}/reservation-links/${linkId}`, { method: 'DELETE' })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return toast.error(body.error ?? 'Unable to remove reservation link')
    toast.success('Reservation link removed'); await openDetail(detail!.id)
  }

  async function receive() {
    const lines = detail!.lines.filter((line) => Number(receiptQty[line.id] ?? 0) > 0).map((line) => ({ purchaseRequestLineId: line.id, quantity: receiptQty[line.id] }))
    if (!lines.length) return toast.error('Enter at least one received quantity')
    setWorking(true)
    const response = await fetch(`/api/v1/purchase-requests/${detail!.id}/receipts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...shipping, lines }) })
    const body = await response.json().catch(() => ({})); setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Unable to post receipt')
    toast.success('Goods receipt posted to the inventory ledger'); setReceiptQty({}); await openDetail(detail!.id); void load()
  }

  async function upload(file: File) {
    const formData = new FormData(); formData.set('file', file); formData.set('kind', 'QUOTATION')
    setWorking(true)
    const response = await fetch(`/api/v1/purchase-requests/${detail!.id}/attachments`, { method: 'POST', body: formData })
    const body = await response.json().catch(() => ({})); setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Upload failed')
    toast.success('Attachment stored'); await openDetail(detail!.id)
  }

  return <div className="space-y-6">
    <PageHeader title="Purchase requests" description="Deficit-linked purchasing from backlog through receipt in store" icon={ShoppingCart}>
      <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 size-4" />Refresh</Button>{canManage && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />New purchase request</Button>}
    </PageHeader>
    <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Status</TableHead><TableHead>Created by</TableHead><TableHead>Lines</TableHead><TableHead>Provider</TableHead><TableHead /></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></TableCell></TableRow> : items.map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{item.requestNo}</TableCell><TableCell><Status value={item.status} /></TableCell><TableCell>{item.createdBy.name}</TableCell><TableCell>{item.lines.length}</TableCell><TableCell>{item.provider || '—'}</TableCell><TableCell><Button variant="outline" size="sm" onClick={() => void openDetail(item.id)}>Open</Button></TableCell></TableRow>)}</TableBody></Table></div>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>New purchase request</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Component</Label><Select value={form.componentId} onValueChange={(componentId) => { const deficit = deficitByComponent.get(componentId); setForm({ ...form, componentId, quantity: deficit ? String(deficit) : form.quantity }) }}><SelectTrigger><SelectValue placeholder="Select component" /></SelectTrigger><SelectContent>{components.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}{deficitByComponent.has(c.id) ? ` · deficit ${deficitByComponent.get(c.id)}` : ''}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Purchase type</Label><Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FOREIGN_STANDARD">Foreign (Standard Item)</SelectItem><SelectItem value="FOREIGN_MANUFACTURED">Foreign (Manufactured)</SelectItem><SelectItem value="LOCAL_STANDARD">Local Standard</SelectItem><SelectItem value="LOCAL_MANUFACTURED">Local Manufactured</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Quantity</Label><Input type="number" min="0.000001" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div><div className="space-y-2"><Label>Remarks</Label><Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={working || !form.componentId} onClick={() => void create()}>{working && <Loader2 className="mr-2 size-4 animate-spin" />}Create</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={detailOpen} onOpenChange={setDetailOpen}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>{detail?.requestNo} · {detail && <Status value={detail.status} />}</DialogTitle></DialogHeader>{detail && <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3"><Field label="Provider" value={shipping.provider} onChange={(provider) => setShipping({ ...shipping, provider })} /><Field label="Tracking number" value={shipping.trackingNumber} onChange={(trackingNumber) => setShipping({ ...shipping, trackingNumber })} /><Field label="Box number" value={shipping.boxNumber} onChange={(boxNumber) => setShipping({ ...shipping, boxNumber })} /></div>
      {canManage && detail.status !== 'RECEIVED_IN_STORE' && <Button size="sm" variant="outline" disabled={working} onClick={() => void saveShipping()}>Save shipping details</Button>}
      <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Component</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Ordered</TableHead><TableHead className="text-right">Received</TableHead><TableHead>Linked reservations</TableHead>{canReceive && <TableHead>Receive now</TableHead>}</TableRow></TableHeader><TableBody>{detail.lines.map((line) => { const received = line.receivedQuantity ?? String(line.receiptLines.reduce((sum, item) => sum + Number(item.quantity), 0)); return <TableRow key={line.id}><TableCell>{line.component.code} — {line.component.title}</TableCell><TableCell className="text-xs">{line.type.replaceAll('_', ' ')}</TableCell><TableCell className="text-right">{line.quantity}</TableCell><TableCell className="text-right">{received}</TableCell><TableCell>{line.reservationLinks.length ? line.reservationLinks.map((link) => <div key={link.id} className="flex items-center gap-1 text-xs"><span>{link.reservationLine.reservation.reservationNo}: {link.quantity}</span>{canManage && detail.status === 'BACKLOG' && <Button variant="ghost" size="icon" className="size-6" onClick={() => void unlink(link.id)}><Trash2 className="size-3" /></Button>}</div>) : <span className="text-xs text-muted-foreground">None</span>}</TableCell>{canReceive && <TableCell><Input className="w-28" type="number" min="0" step="any" disabled={!['ORDERED', 'SHIPPED'].includes(detail.status)} value={receiptQty[line.id] ?? ''} onChange={(e) => setReceiptQty({ ...receiptQty, [line.id]: e.target.value })} /></TableCell>}</TableRow> })}</TableBody></Table></div>
      <div className="flex flex-wrap gap-2">{canManage && detail.status === 'BACKLOG' && <Button onClick={() => void transition('PENDING_ORDER_APPROVAL')}>Submit for order approval</Button>}{canApprove && detail.status === 'PENDING_ORDER_APPROVAL' && <Button onClick={() => void transition('ORDERED')}>Approve and mark ordered</Button>}{canManage && detail.status === 'ORDERED' && <Button onClick={() => void transition('SHIPPED')}>Mark shipped</Button>}{canReceive && ['ORDERED', 'SHIPPED'].includes(detail.status) && <Button variant="secondary" onClick={() => void receive()}>Post goods receipt</Button>}</div>
      <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-medium">Attachments</h3>{canManage && <><input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} /><Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><FileUp className="mr-2 size-4" />Upload (max 5 MB)</Button></>}</div>{detail.attachments?.map((item) => <a key={item.id} className="flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-muted" href={`/api/v1/purchase-requests/${detail.id}/attachments/${item.id}`}><Download className="size-4" />{item.fileName}<span className="ml-auto text-xs text-muted-foreground">{item.kind} · {(item.sizeBytes / 1024).toFixed(0)} KB</span></a>)}</div>
    </div>}</DialogContent></Dialog>
  </div>
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-2"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div> }
