'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { isUploadTooLarge, MAX_UPLOAD_LABEL } from '@/lib/upload-limits'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface BomUploadDialogProps { open: boolean; onOpenChange: (open: boolean) => void; projectId: string | null; projectName: string; onSuccess: () => void }
type ComponentOption = { id: string; code: string; title: string }
type BomLine = { id: string; sourceLineKey: string; parentProjectComponentId: string | null; title: string; quantity: string; reconciliationStatus: string; component?: ComponentOption | null }
type UploadData = { id: string; fileName: string; status: string; lines: BomLine[] }

export function BomUploadDialog({ open, onOpenChange, projectId, projectName, onSuccess }: BomUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [upload, setUpload] = useState<UploadData | null>(null)
  const [components, setComponents] = useState<ComponentOption[]>([])
  const [choices, setChoices] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/v1/components?limit=100').then((response) => response.json()).then((body) => setComponents(body.data ?? [])).catch(() => {})
  }, [open])

  function chooseFile(selected: File | null) {
    if (selected && isUploadTooLarge(selected)) return toast.error(`File too large (max ${MAX_UPLOAD_LABEL})`)
    if (selected && !selected.name.toLowerCase().endsWith('.xlsx')) return toast.error('Use the fixed .xlsx BOM template')
    setFile(selected); setUpload(null)
  }

  async function stage() {
    if (!file || !projectId) return
    const form = new FormData(); form.set('file', file); setLoading(true)
    const response = await fetch(`/api/v1/projects/${projectId}/bom/uploads`, { method: 'POST', body: form })
    const body = await response.json().catch(() => ({})); setLoading(false)
    if (!response.ok) return toast.error(body.row ? `${body.error} (row ${body.row})` : body.error ?? 'Upload failed')
    setUpload(body.data); toast.success('BOM staged for reconciliation')
  }

  async function reconcile(line: BomLine, create: boolean) {
    setLoading(true)
    const response = await fetch(`/api/v1/projects/${projectId}/bom/uploads/${upload!.id}/lines/${line.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(create ? { createComponent: {} } : { componentId: choices[line.id] }) })
    const body = await response.json().catch(() => ({})); setLoading(false)
    if (!response.ok) return toast.error(body.error ?? 'Reconciliation failed')
    setUpload({ ...upload!, lines: upload!.lines.map((item) => item.id === line.id ? body.data : item) }); toast.success(create ? 'New component created' : 'Component matched')
  }

  async function accept() {
    setLoading(true)
    const response = await fetch(`/api/v1/projects/${projectId}/bom/uploads/${upload!.id}/accept`, { method: 'POST' })
    const body = await response.json().catch(() => ({})); setLoading(false)
    if (!response.ok) return toast.error(body.error ?? 'BOM could not be accepted')
    setUpload(body.data); toast.success('BOM accepted as the active project definition'); onSuccess()
  }

  function close() { setFile(null); setUpload(null); setChoices({}); onOpenChange(false) }
  const reconciled = upload?.lines.every((line) => line.component && line.reconciliationStatus === 'RECONCILED') ?? false

  return <Dialog open={open} onOpenChange={(value) => value ? onOpenChange(true) : close()}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>Project BOM · {projectName}</DialogTitle><DialogDescription>Use the fixed hierarchical template. Uploads remain pending until every line is reconciled and an inventory manager accepts them.</DialogDescription></DialogHeader>
    {!upload ? <div className="space-y-4"><a href="/api/v1/projects/bom/template" className="inline-flex items-center text-sm text-primary hover:underline"><Download className="mr-2 size-4" />Download fixed Excel template</a><div className="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center hover:bg-muted/40" onClick={() => inputRef.current?.click()}><input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} /><FileSpreadsheet className="mx-auto size-8 text-muted-foreground" /><p className="mt-2 text-sm">{file?.name ?? 'Choose an .xlsx BOM file'}</p><p className="text-xs text-muted-foreground">Maximum {MAX_UPLOAD_LABEL}</p></div></div> : <div className="space-y-4"><div className="flex items-center gap-2"><Badge>{upload.status.replaceAll('_', ' ')}</Badge><span className="text-sm">{upload.fileName}</span></div><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Line</TableHead><TableHead>Parent</TableHead><TableHead>Component description</TableHead><TableHead>Qty/set</TableHead><TableHead>Reconciliation</TableHead></TableRow></TableHeader><TableBody>{upload.lines.map((line) => <TableRow key={line.id}><TableCell>{line.sourceLineKey}</TableCell><TableCell>{upload.lines.find((parent) => parent.id === line.parentProjectComponentId)?.sourceLineKey ?? 'Project'}</TableCell><TableCell>{line.title}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{line.component ? <div className="flex items-center gap-2 text-sm"><CheckCircle className="size-4 text-emerald-600" />{line.component.code} — {line.component.title}</div> : <div className="flex min-w-[360px] gap-2"><Select value={choices[line.id] ?? ''} onValueChange={(value) => setChoices({ ...choices, [line.id]: value })}><SelectTrigger><SelectValue placeholder="Match store component" /></SelectTrigger><SelectContent>{components.map((component) => <SelectItem key={component.id} value={component.id}>{component.code} — {component.title}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" disabled={!choices[line.id] || loading} onClick={() => void reconcile(line, false)}>Match</Button><Button size="sm" disabled={loading} onClick={() => void reconcile(line, true)}>Create</Button></div>}</TableCell></TableRow>)}</TableBody></Table></div></div>}
    <DialogFooter><Button variant="outline" onClick={close}>Close</Button>{!upload && <Button disabled={!file || loading} onClick={() => void stage()}>{loading && <Loader2 className="mr-2 size-4 animate-spin" />}<Upload className="mr-2 size-4" />Stage upload</Button>}{upload && upload.status === 'PENDING_RECONCILIATION' && <Button disabled={!reconciled || loading} onClick={() => void accept()}>{loading && <Loader2 className="mr-2 size-4 animate-spin" />}Accept BOM</Button>}</DialogFooter>
  </DialogContent></Dialog>
}
