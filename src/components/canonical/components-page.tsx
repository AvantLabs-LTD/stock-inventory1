'use client'

import { useCallback, useEffect, useState } from 'react'
import { Boxes, Loader2, Pencil, Plus, Search } from 'lucide-react'
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

type ComponentItem = {
  id: string; code: string; title: string; discipline: 'MECHANICAL' | 'ELECTRONICS'; description: string
  function?: string | null; link?: string | null; optionSelection?: string | null; remarks?: string | null; unit: string
  balance: { onHand: string; allocated: string; available: string }
}

const emptyForm = { title: '', discipline: 'MECHANICAL', description: '', function: '', link: '', optionSelection: '', remarks: '', unit: 'pcs' }

export function ComponentsPage() {
  const user = useAuthStore((state) => state.user)
  const canEdit = Boolean(user && hasPermission(user.role, 'components', 'edit'))
  const [items, setItems] = useState<ComponentItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<ComponentItem | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/v1/components?limit=100&search=${encodeURIComponent(search)}`)
    const body = await response.json().catch(() => ({}))
    if (response.ok) setItems(body.data ?? [])
    else toast.error(body.error ?? 'Unable to load components')
    setLoading(false)
  }, [search])

  useEffect(() => { void load() }, [load])

  function showForm(item?: ComponentItem) {
    setEditing(item ?? null)
    setForm(item ? {
      title: item.title, discipline: item.discipline, description: item.description, function: item.function ?? '',
      link: item.link ?? '', optionSelection: item.optionSelection ?? '', remarks: item.remarks ?? '', unit: item.unit,
    } : emptyForm)
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    const response = await fetch(editing ? `/api/v1/components/${editing.id}` : '/api/v1/components', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const body = await response.json().catch(() => ({}))
    setSaving(false)
    if (!response.ok) return toast.error(body.error ?? 'Unable to save component')
    toast.success(editing ? 'Component updated' : 'Component created')
    setOpen(false)
    void load()
  }

  return <div className="space-y-6">
    <PageHeader title="Components" description="Project-independent component master and live stock balances" icon={Boxes}>
      {canEdit && <Button size="sm" onClick={() => showForm()}><Plus className="mr-2 size-4" />Add component</Button>}
    </PageHeader>
    <div className="flex max-w-md gap-2">
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code, title, or description" />
      <Button variant="outline" onClick={() => void load()}><Search className="size-4" /></Button>
    </div>
    <div className="overflow-x-auto rounded-lg border">
      <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Component</TableHead><TableHead>Category</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Reserved</TableHead><TableHead className="text-right">Available</TableHead>{canEdit && <TableHead />}</TableRow></TableHeader>
        <TableBody>{loading ? <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></TableCell></TableRow> : items.map((item) => <TableRow key={item.id}>
          <TableCell className="font-mono text-xs">{item.code}</TableCell><TableCell><div className="font-medium">{item.title}</div><div className="max-w-md truncate text-xs text-muted-foreground">{item.description}</div></TableCell>
          <TableCell><Badge variant="outline">{item.discipline}</Badge></TableCell><TableCell className="text-right tabular-nums">{item.balance.onHand}</TableCell><TableCell className="text-right tabular-nums">{item.balance.allocated}</TableCell><TableCell className="text-right font-medium tabular-nums">{item.balance.available}</TableCell>
          {canEdit && <TableCell><Button variant="ghost" size="icon" onClick={() => showForm(item)}><Pencil className="size-4" /></Button></TableCell>}
        </TableRow>)}</TableBody>
      </Table>
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing ? 'Edit component' : 'Add component'}</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="space-y-2"><Label>Category</Label><Select value={form.discipline} onValueChange={(discipline) => setForm({ ...form, discipline })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MECHANICAL">Mechanical</SelectItem><SelectItem value="ELECTRONICS">Electronics</SelectItem></SelectContent></Select></div>
        <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="space-y-2"><Label>Function (optional)</Label><Input value={form.function} onChange={(e) => setForm({ ...form, function: e.target.value })} /></div>
        <div className="space-y-2"><Label>Option selection (optional)</Label><Input value={form.optionSelection} onChange={(e) => setForm({ ...form, optionSelection: e.target.value })} /></div>
        <div className="space-y-2"><Label>Link (optional)</Label><Input type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} /></div>
        <div className="space-y-2"><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Remarks (optional)</Label><Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
      </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving || !form.title || !form.description} onClick={() => void save()}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Save</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>
}
