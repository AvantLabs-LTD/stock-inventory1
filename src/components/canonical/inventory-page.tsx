'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, Loader2, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth-store'

type ComponentOption = { id: string; code: string; title: string; unit: string }
type LedgerItem = { id: string; type: string; quantity: string; onHandAfter: string; sourceType: string; sourceId: string; occurredAt: string; component: ComponentOption; actor: { name: string }; remarks?: string | null }

export function InventoryPage() {
  const user = useAuthStore((state) => state.user)
  const canAdjust = Boolean(user && hasPermission(user.role, 'stock', 'adjust'))
  const [items, setItems] = useState<LedgerItem[]>([])
  const [components, setComponents] = useState<ComponentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [form, setForm] = useState({ kind: 'ADJUSTMENT', componentId: '', quantity: '', reason: '', remarks: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const [ledgerResponse, componentResponse] = await Promise.all([
      fetch('/api/v1/inventory/ledger?limit=100'),
      fetch('/api/v1/components?limit=100'),
    ])
    const [ledgerBody, componentBody] = await Promise.all([ledgerResponse.json(), componentResponse.json()])
    if (ledgerResponse.ok) setItems(ledgerBody.data ?? [])
    if (componentResponse.ok) setComponents(componentBody.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function postAdjustment() {
    setWorking(true)
    const response = await fetch('/api/v1/inventory/adjustments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: form.kind, reason: form.reason, remarks: form.remarks, lines: [{ componentId: form.componentId, quantity: form.quantity }] }),
    })
    const body = await response.json().catch(() => ({}))
    setWorking(false)
    if (!response.ok) return toast.error(body.error ?? 'Unable to post adjustment')
    toast.success('Adjustment posted to the canonical ledger')
    setOpen(false)
    setForm({ kind: 'ADJUSTMENT', componentId: '', quantity: '', reason: '', remarks: '' })
    void load()
  }

  return <div className="space-y-6">
    <PageHeader title="Inventory ledger" description="Immutable component movements and rebuildable balances" icon={ArrowLeftRight}>
      <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 size-4" />Refresh</Button>
      {canAdjust && <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-2 size-4" />Post adjustment</Button>}
    </PageHeader>
    <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Component</TableHead><TableHead>Movement</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">On hand after</TableHead><TableHead>Source</TableHead><TableHead>Actor</TableHead></TableRow></TableHeader><TableBody>
      {loading ? <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></TableCell></TableRow> : items.map((item) => <TableRow key={item.id}><TableCell className="text-xs">{new Date(item.occurredAt).toLocaleString()}</TableCell><TableCell><div className="font-medium">{item.component.title}</div><div className="font-mono text-xs text-muted-foreground">{item.component.code}</div></TableCell><TableCell>{item.type.replaceAll('_', ' ')}</TableCell><TableCell className="text-right tabular-nums">{item.quantity}</TableCell><TableCell className="text-right font-medium tabular-nums">{item.onHandAfter}</TableCell><TableCell className="font-mono text-xs">{item.sourceType}</TableCell><TableCell>{item.actor.name}</TableCell></TableRow>)}
    </TableBody></Table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Post inventory movement</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Movement purpose</Label><Select value={form.kind} onValueChange={(kind) => setForm({ ...form, kind })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ADJUSTMENT">Adjustment</SelectItem><SelectItem value="OPENING">Opening stock</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Component</Label><Select value={form.componentId} onValueChange={(componentId) => setForm({ ...form, componentId })}><SelectTrigger><SelectValue placeholder="Select component" /></SelectTrigger><SelectContent>{components.map((component) => <SelectItem key={component.id} value={component.id}>{component.code} — {component.title}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>{form.kind === 'OPENING' ? 'Opening quantity' : 'Signed quantity'}</Label><Input type="number" step="any" min={form.kind === 'OPENING' ? '0.000001' : undefined} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} placeholder={form.kind === 'OPENING' ? 'Positive initial balance' : 'Positive to add, negative to remove'} /></div><div className="space-y-2"><Label>Reason</Label><Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></div><div className="space-y-2"><Label>Remarks</Label><Textarea value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={working || !form.componentId || !form.quantity || !form.reason} onClick={() => void postAdjustment()}>{working && <Loader2 className="mr-2 size-4 animate-spin" />}Post immutable movement</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
