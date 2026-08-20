"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Boxes, ClipboardList, Download, Gauge, Plus, RefreshCw, ShoppingCart, Tags, Upload, Warehouse } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useAuthStore } from "@/stores/auth-store"

type Ref = { id: string; name: string; status?: string }
type Item = { id: string; code: string; title: string; discipline: string; unit: string; status: string; defaultClassification?: Ref | null; balance?: { onHand: string; reserved: string }; free?: number; demand?: string; procurement?: string; deficit?: string }

async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || "Request failed")
  return body
}

function Empty({ children }: { children: string }) {
  return <div className="py-14 text-center text-sm text-muted-foreground">{children}</div>
}

export function OverviewPage() {
  const [data, setData] = useState<Record<string, number | string>>({})
  useEffect(() => { jsonFetch("/api/v1/overview").then(setData).catch(e => toast.error(e.message)) }, [])
  const cards = [["Active items", data.items], ["Open demands", data.openDemands], ["My open demands", data.myOpenDemands], ["Reserved", data.reserved], ["Allocated to demands", data.allocated], ["Active purchases", data.activePurchases]]
  return <div className="space-y-6"><PageHeader title="Store overview" description="A single view of physical stock, protected stock, allocations and procurement." icon={Gauge} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label,value]) => <Card key={String(label)}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{String(value ?? "—")}</CardContent></Card>)}</div>
    <Card><CardContent className="pt-6 text-sm text-muted-foreground">Free stock is on-hand minus reserved. Allocation is the final handover: it consumes both reservation and on-hand stock. Purchase coverage never changes stock until a receipt is posted.</CardContent></Card>
  </div>
}

export function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]), [classes, setClasses] = useState<Ref[]>([]), [open, setOpen] = useState(false)
  const load = useCallback(() => Promise.all([jsonFetch("/api/v1/items"), jsonFetch("/api/v1/reference-data")]).then(([a,b]) => { setItems(a.items); setClasses(b.classifications) }).catch(e => toast.error(e.message)), [])
  useEffect(() => { void load() }, [load])
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget)
    try { await jsonFetch("/api/v1/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(f)) }); toast.success("Item created"); setOpen(false); await load() } catch(e) { toast.error((e as Error).message) }
  }
  return <div className="space-y-6"><PageHeader title="Store Inventory" description="The primary view of current stock, commitments, demand, procurement and shortages." icon={Boxes}>
    <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 size-4"/>New item</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Create item</DialogTitle></DialogHeader>
      <form className="grid gap-4" onSubmit={submit}><div className="grid grid-cols-2 gap-3"><div><Label>Code</Label><Input name="code" required/></div><div><Label>Unit</Label><Input name="unit" defaultValue="pcs"/></div></div><div><Label>Title</Label><Input name="title" required/></div>
        <div><Label>Discipline</Label><Select name="discipline" defaultValue="MECHANICAL"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="MECHANICAL">Mechanical</SelectItem><SelectItem value="ELECTRONICS">Electronics</SelectItem></SelectContent></Select></div>
        <div><Label>Default classification</Label><Select name="defaultClassificationId"><SelectTrigger><SelectValue placeholder="Optional"/></SelectTrigger><SelectContent>{classes.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Description</Label><Textarea name="description"/></div><Button type="submit">Create item</Button></form></DialogContent></Dialog>
  </PageHeader><Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Item</TableHead><TableHead>Classification</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Reserved</TableHead><TableHead className="text-right">Free</TableHead><TableHead className="text-right">Demand</TableHead><TableHead className="text-right">In procurement</TableHead><TableHead className="text-right">Deficit</TableHead></TableRow></TableHeader>
    <TableBody>{items.map(i=><TableRow key={i.id}><TableCell className="font-mono">{i.code}</TableCell><TableCell><div className="font-medium">{i.title}</div><div className="text-xs text-muted-foreground">{i.discipline} · {i.unit}</div></TableCell><TableCell>{i.defaultClassification?.name || "—"}</TableCell><TableCell className="text-right">{i.balance?.onHand || "0"}</TableCell><TableCell className="text-right">{i.balance?.reserved || "0"}</TableCell><TableCell className="text-right font-medium">{i.free ?? 0}</TableCell><TableCell className="text-right">{i.demand ?? 0}</TableCell><TableCell className="text-right">{i.procurement ?? 0}</TableCell><TableCell className="text-right">{i.deficit ?? 0}</TableCell></TableRow>)}</TableBody></Table>{!items.length&&<Empty>No items yet.</Empty>}</CardContent></Card></div>
}

type Demand = { id:string; demandNo:string; state:string; requestedAt:string; requestedBy:{id:string;name:string}; departmentTag?:Ref|null; lines:Array<{id:string}>; quantities?:{required:string;reserved:string;allocated:string;remaining:string}|null }
export function DemandsPage() {
  const user=useAuthStore(s=>s.user), [demands,setDemands]=useState<Demand[]>([]), [items,setItems]=useState<Item[]>([]), [refs,setRefs]=useState<{classifications:Ref[];departments:Ref[];projects:Ref[]}>({classifications:[],departments:[],projects:[]}), [mine,setMine]=useState(true), [open,setOpen]=useState(false), [selected,setSelected]=useState<string|null>(null)
  const load=useCallback(()=>Promise.all([jsonFetch("/api/v1/demands?mine="+mine),jsonFetch("/api/v1/items"),jsonFetch("/api/v1/reference-data")]).then(([a,b,c])=>{setDemands(a.demands);setItems(b.items);setRefs(c)}).catch(e=>toast.error(e.message)),[mine])
  useEffect(()=>{void load()},[load])
  async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const item=items.find(x=>x.id===f.get("itemId"));try{await jsonFetch("/api/v1/demands",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({departmentTagId:f.get("departmentTagId")||null,remarks:f.get("remarks"),lines:[{itemId:item?.id,title:item?.title,quantity:f.get("quantity"),classificationId:f.get("classificationId")||item?.defaultClassification?.id,projectTagId:f.get("projectTagId")||null,vendorName:f.get("vendorName")||null}]})});toast.success("Demand submitted");setOpen(false);await load()}catch(e){toast.error((e as Error).message)}}
  return <div className="space-y-6"><PageHeader title="Demands" description="Department belongs to the demand; project belongs only to an individual row." icon={ClipboardList}>
    <div className="flex gap-2"><Button variant={mine?"default":"outline"} onClick={()=>setMine(!mine)}>{mine?"My demands":"All demands"}</Button><a href="/api/v1/demands/template"><Button variant="outline"><Download className="mr-2 size-4"/>Template</Button></a>
    <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 size-4"/>New demand</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Submit demand</DialogTitle></DialogHeader><form className="grid gap-4" onSubmit={create}>
      <div><Label>Department tag</Label><Select name="departmentTagId"><SelectTrigger><SelectValue placeholder="Optional"/></SelectTrigger><SelectContent>{refs.departments.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Item</Label><Select name="itemId" required><SelectTrigger><SelectValue placeholder="Select item"/></SelectTrigger><SelectContent>{items.map(x=><SelectItem key={x.id} value={x.id}>{x.code} — {x.title}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-3"><div><Label>Quantity</Label><Input name="quantity" type="number" min="0.000001" step="any" required/></div><div><Label>Project tag</Label><Select name="projectTagId"><SelectTrigger><SelectValue placeholder="Optional"/></SelectTrigger><SelectContent>{refs.projects.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div></div>
      <div><Label>Classification override</Label><Select name="classificationId"><SelectTrigger><SelectValue placeholder="Use item default"/></SelectTrigger><SelectContent>{refs.classifications.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Vendor name</Label><Input name="vendorName" placeholder="Optional; created automatically"/></div><div><Label>Remarks</Label><Textarea name="remarks"/></div><Button>Submit demand</Button></form></DialogContent></Dialog></div>
  </PageHeader><DemandImport onDone={load}/><Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>Demand</TableHead><TableHead>Requester / department</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Required</TableHead><TableHead className="text-right">Reserved</TableHead><TableHead className="text-right">Allocated</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{demands.map(d=><TableRow key={d.id}><TableCell><div className="font-medium">{d.demandNo}</div><div className="text-xs text-muted-foreground">{d.lines.length} row(s)</div></TableCell><TableCell>{d.requestedBy.name}<div className="text-xs text-muted-foreground">{d.departmentTag?.name||"No department tag"}</div></TableCell><TableCell><Badge variant="outline">{d.state}</Badge></TableCell><TableCell className="text-right">{d.quantities?.required||0}</TableCell><TableCell className="text-right">{d.quantities?.reserved||0}</TableCell><TableCell className="text-right">{d.quantities?.allocated||0}</TableCell><TableCell className="text-right">{d.quantities?.remaining||0}</TableCell><TableCell><Button size="sm" variant="outline" onClick={()=>setSelected(d.id)}>Manage</Button></TableCell></TableRow>)}</TableBody></Table>{!demands.length&&<Empty>{mine?"You have no demands yet.":"No demands yet."}</Empty>}</CardContent></Card><p className="text-xs text-muted-foreground">Signed in as {user?.name}. “My demands” is a filter only; all users can switch to the complete operational view.</p><DemandManager demandId={selected} onClose={()=>setSelected(null)} onChanged={load}/></div>
}

type ManagedLine = { id:string; title:string; unit:string; item?:Item|null; projectTag?:Ref|null; classification:Ref; quantities:{required:string;reserved:string;allocated:string;remaining:string;backlog:string;pendingApproval:string;ordered:string;shipped:string;physicalDeficit:string;unprocuredDeficit:string;fulfilmentFacet:string;stockFacet:string}; allocationLines:Array<{id:string;quantity:string;returnLines:Array<{quantity:string}>}>; purchaseLinks:Array<{id:string;quantity:string;purchaseRequestLine:{purchaseRequest:{id:string;requestNo:string;status:string}}}> }
function DemandManager({demandId,onClose,onChanged}:{demandId:string|null;onClose:()=>void;onChanged:()=>void}) {
  const [demand,setDemand]=useState<{demandNo:string;state:string;lines:ManagedLine[]}|null>(null)
  const load=useCallback(()=>{if(!demandId)return;jsonFetch("/api/v1/demands/"+demandId).then(x=>setDemand(x.demand)).catch(e=>toast.error(e.message))},[demandId])
  useEffect(()=>{load()},[load])
  async function quantityAction(line:ManagedLine,action:"reserve"|"release") {
    const value=window.prompt("Quantity to "+action)
    if(!value)return
    try{await jsonFetch("/api/v1/demands/lines/"+line.id+"/"+action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quantity:value,idempotencyKey:crypto.randomUUID()})});toast.success(action==="reserve"?"Stock reserved":"Reservation released");load();onChanged()}catch(e){toast.error((e as Error).message)}
  }
  async function allocate(line:ManagedLine) {
    if(!demandId)return;const value=window.prompt("Quantity to allocate / hand over")
    if(!value)return
    try{await jsonFetch("/api/v1/demands/"+demandId+"/allocate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idempotencyKey:crypto.randomUUID(),lines:[{demandLineId:line.id,quantity:value}]})});toast.success("Material allocated");load();onChanged()}catch(e){toast.error((e as Error).message)}
  }
  async function returnStock(line:ManagedLine) {
    const allocation=line.allocationLines.find(x=>Number(x.quantity)>x.returnLines.reduce((n,r)=>n+Number(r.quantity),0))
    if(!allocation)return toast.error("No allocated quantity is available to return")
    const value=window.prompt("Quantity returned")
    if(!value)return
    try{await jsonFetch("/api/v1/inventory/returns",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idempotencyKey:crypto.randomUUID(),lines:[{allocationLineId:allocation.id,quantity:value}]})});toast.success("Return posted");load();onChanged()}catch(e){toast.error((e as Error).message)}
  }
  async function editPurchaseLink(line:ManagedLine) {
    const link=line.purchaseLinks.find(x=>["BACKLOG","PENDING_APPROVAL","ORDERED","SHIPPED"].includes(x.purchaseRequestLine.purchaseRequest.status))
    if(!link)return toast.error("No active purchase link")
    const value=window.prompt("Linked ordered quantity; enter 0 to remove",link.quantity)
    if(value===null)return
    const url="/api/v1/purchase-requests/"+link.purchaseRequestLine.purchaseRequest.id+"/demand-links/"+link.id
    try{if(Number(value)===0){const response=await fetch(url,{method:"DELETE"});if(!response.ok)throw new Error("Could not remove purchase link")}else await jsonFetch(url,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({quantity:value})});toast.success("Purchase coverage updated");load();onChanged()}catch(e){toast.error((e as Error).message)}
  }
  return <Dialog open={Boolean(demandId)} onOpenChange={x=>{if(!x){setDemand(null);onClose()}}}><DialogContent className="max-w-6xl"><DialogHeader><DialogTitle>{demand?.demandNo||"Demand"}</DialogTitle></DialogHeader>{!demand?<div className="py-10 text-center">Loading…</div>:<div className="max-h-[70vh] overflow-auto"><Table><TableHeader><TableRow><TableHead>Row</TableHead><TableHead>State</TableHead><TableHead className="text-right">Required</TableHead><TableHead className="text-right">Reserved</TableHead><TableHead className="text-right">Allocated</TableHead><TableHead className="text-right">Ordered</TableHead><TableHead className="text-right">Deficit</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{demand.lines.map(line=><TableRow key={line.id}><TableCell><div className="font-medium">{line.item?.code||"Unreconciled"} — {line.title}</div><div className="text-xs text-muted-foreground">{line.projectTag?.name||"No project"} · {line.classification.name}{line.purchaseLinks.length?" · "+line.purchaseLinks.map(x=>x.purchaseRequestLine.purchaseRequest.requestNo).join(", "):""}</div></TableCell><TableCell><div className="flex flex-col gap-1"><Badge variant="outline">{line.quantities.fulfilmentFacet}</Badge><Badge variant="secondary">{line.quantities.stockFacet}</Badge></div></TableCell><TableCell className="text-right">{line.quantities.required}</TableCell><TableCell className="text-right">{line.quantities.reserved}</TableCell><TableCell className="text-right">{line.quantities.allocated}</TableCell><TableCell className="text-right"><button className="underline-offset-2 hover:underline" onClick={()=>editPurchaseLink(line)}>{line.quantities.ordered}</button></TableCell><TableCell className="text-right">{line.quantities.physicalDeficit}</TableCell><TableCell><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" disabled={!line.item||Number(line.quantities.remaining)<=Number(line.quantities.reserved)} onClick={()=>quantityAction(line,"reserve")}>Reserve</Button><Button size="sm" variant="outline" disabled={Number(line.quantities.reserved)<=0} onClick={()=>quantityAction(line,"release")}>Release</Button><Button size="sm" disabled={Number(line.quantities.reserved)<=0} onClick={()=>allocate(line)}>Allocate</Button><Button size="sm" variant="secondary" disabled={Number(line.quantities.allocated)<=0} onClick={()=>returnStock(line)}>Return</Button></div></TableCell></TableRow>)}</TableBody></Table></div>}</DialogContent></Dialog>
}

function DemandImport({onDone}:{onDone:()=>void}) {
  const [file,setFile]=useState<File|null>(null)
  async function upload(){if(!file)return;const f=new FormData();f.set("file",file);try{await jsonFetch("/api/v1/demands/import",{method:"POST",body:f});toast.success("Demand imported");setFile(null);onDone()}catch(e){toast.error((e as Error).message)}}
  return <Card><CardContent className="flex flex-wrap items-center gap-3 pt-6"><Upload className="size-5 text-muted-foreground"/><div className="flex-1"><div className="text-sm font-medium">Bulk demand upload</div><div className="text-xs text-muted-foreground">One workbook creates one demand; each worksheet row is one demand row.</div></div><Input className="max-w-xs" type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><Button variant="outline" disabled={!file} onClick={upload}>Upload</Button></CardContent></Card>
}

export function PurchasingPage() {
  const [requests,setRequests]=useState<Array<{id:string;requestNo:string;status:string;vendor?:Ref|null;lines:Array<{id:string;quantity:string;item:Item;classification:Ref;demandLinks:Array<{quantity:string;demandLine:{demand:{demandNo:string}}}>;receiptLines:Array<{quantity:string}>}>}>>([])
  const [items,setItems]=useState<Item[]>([]), [classes,setClasses]=useState<Ref[]>([]), [open,setOpen]=useState(false)
  const load=useCallback(()=>Promise.all([jsonFetch("/api/v1/purchase-requests"),jsonFetch("/api/v1/items"),jsonFetch("/api/v1/reference-data")]).then(([a,b,c])=>{setRequests(a.requests);setItems(b.items);setClasses(c.classifications)}).catch(e=>toast.error(e.message)),[])
  useEffect(()=>{void load()},[load])
  async function advance(id:string,status:string){const next:{[k:string]:string}={BACKLOG:"PENDING_APPROVAL",PENDING_APPROVAL:"ORDERED",ORDERED:"SHIPPED"};if(!next[status])return;try{await jsonFetch("/api/v1/purchase-requests/"+id+"/transition",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next[status]})});toast.success("Purchase moved to "+next[status]);await load()}catch(e){toast.error((e as Error).message)}}
  async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),item=items.find(x=>x.id===f.get("itemId"));try{await jsonFetch("/api/v1/purchase-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vendorName:f.get("vendorName"),remarks:f.get("remarks"),lines:[{itemId:item?.id,classificationId:f.get("classificationId")||item?.defaultClassification?.id,quantity:f.get("quantity")}]})});toast.success("Purchase request created");setOpen(false);await load()}catch(e){toast.error((e as Error).message)}}
  async function receive(request:{id:string;lines:Array<{id:string;quantity:string;receiptLines:Array<{quantity:string}>}>}){const line=request.lines[0];if(!line)return;const received=line.receiptLines.reduce((n,x)=>n+Number(x.quantity),0),value=window.prompt("Quantity received for first row",String(Number(line.quantity)-received));if(!value)return;try{await jsonFetch("/api/v1/purchase-requests/"+request.id+"/receipts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idempotencyKey:crypto.randomUUID(),lines:[{purchaseRequestLineId:line.id,quantity:value}]})});toast.success("Receipt posted");await load()}catch(e){toast.error((e as Error).message)}}
  return <div className="space-y-6"><PageHeader title="Purchasing" description="Order quantities, demand coverage and replenishment remain visibly separate." icon={ShoppingCart}><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 size-4"/>New purchase</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Create backlog purchase</DialogTitle></DialogHeader><form className="grid gap-4" onSubmit={create}><div><Label>Vendor</Label><Input name="vendorName" placeholder="Name is enough; details are optional"/></div><div><Label>Item</Label><Select name="itemId" required><SelectTrigger><SelectValue placeholder="Select item"/></SelectTrigger><SelectContent>{items.map(x=><SelectItem value={x.id} key={x.id}>{x.code} — {x.title}</SelectItem>)}</SelectContent></Select></div><div><Label>Classification</Label><Select name="classificationId"><SelectTrigger><SelectValue placeholder="Use item default"/></SelectTrigger><SelectContent>{classes.map(x=><SelectItem value={x.id} key={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Quantity</Label><Input name="quantity" type="number" step="any" min="0.000001" required/></div><div><Label>Remarks</Label><Textarea name="remarks"/></div><Button>Create backlog request</Button></form></DialogContent></Dialog></PageHeader><Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>Request</TableHead><TableHead>Vendor</TableHead><TableHead>Status</TableHead><TableHead>Rows</TableHead><TableHead className="text-right">Ordered / linked</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{requests.map(r=><TableRow key={r.id}><TableCell className="font-medium">{r.requestNo}</TableCell><TableCell>{r.vendor?.name||"Not assigned"}</TableCell><TableCell><Badge>{r.status}</Badge></TableCell><TableCell><div>{r.lines.length} row(s)</div><div className="text-xs text-muted-foreground">{Array.from(new Set(r.lines.flatMap(x=>x.demandLinks.map(l=>l.demandLine.demand.demandNo)))).join(", ")||"Replenishment only"}</div></TableCell><TableCell className="text-right">{r.lines.reduce((n,x)=>n+Number(x.quantity),0)} / {r.lines.reduce((n,x)=>n+x.demandLinks.reduce((m,l)=>m+Number(l.quantity),0),0)}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2">{["BACKLOG","PENDING_APPROVAL","ORDERED"].includes(r.status)&&<Button size="sm" variant="outline" onClick={()=>advance(r.id,r.status)}>Advance</Button>}{["ORDERED","SHIPPED"].includes(r.status)&&<Button size="sm" onClick={()=>receive(r)}>Receive</Button>}</div></TableCell></TableRow>)}</TableBody></Table>{!requests.length&&<Empty>No purchase requests yet.</Empty>}</CardContent></Card></div>
}

export function InventoryPage() {
  const [entries,setEntries]=useState<Array<{id:string;type:string;quantity:string;onHandAfter:string;occurredAt:string;item:{code:string;title:string;unit:string};actor:{name:string}}>>([])
  const load=useCallback(()=>jsonFetch("/api/v1/inventory/ledger").then(x=>setEntries(x.entries)).catch(e=>toast.error(e.message)),[])
  useEffect(()=>{void load()},[load])
  return <div className="space-y-6"><PageHeader title="Stock Movements" description="The immutable audit history behind the balances shown in Store Inventory." icon={Warehouse}><Button variant="outline" onClick={load}><RefreshCw className="mr-2 size-4"/>Refresh</Button></PageHeader><Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Movement</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Actor</TableHead></TableRow></TableHeader><TableBody>{entries.map(e=><TableRow key={e.id}><TableCell>{new Date(e.occurredAt).toLocaleString()}</TableCell><TableCell>{e.item.code} — {e.item.title}</TableCell><TableCell><Badge variant="outline">{e.type}</Badge></TableCell><TableCell className="text-right">{e.quantity}</TableCell><TableCell className="text-right">{e.onHandAfter}</TableCell><TableCell>{e.actor.name}</TableCell></TableRow>)}</TableBody></Table>{!entries.length&&<Empty>No stock movements yet.</Empty>}</CardContent></Card></div>
}

export function ReferenceDataPage() {
  const [data,setData]=useState<Record<string,Ref[]>>({}), [kind,setKind]=useState("classifications"), [name,setName]=useState("")
  const load=useCallback(()=>jsonFetch("/api/v1/reference-data").then(setData).catch(e=>toast.error(e.message)),[])
  useEffect(()=>{void load()},[load])
  async function add(){try{await jsonFetch("/api/v1/reference-data/"+kind,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});setName("");toast.success("Tag created");await load()}catch(e){toast.error((e as Error).message)}}
  const groups=[["classifications","Item classifications"],["departments","Department tags"],["projects","Project tags"],["vendors","Vendors"]]
  return <div className="space-y-6"><PageHeader title="Tags & reference data" description="Projects and departments are lightweight labels. Classifications and vendors are reusable records." icon={Tags}/><Card><CardContent className="flex flex-wrap gap-3 pt-6"><Select value={kind} onValueChange={setKind}><SelectTrigger className="w-52"><SelectValue/></SelectTrigger><SelectContent>{groups.map(g=><SelectItem key={g[0]} value={g[0]}>{g[1]}</SelectItem>)}</SelectContent></Select><Input className="max-w-sm" value={name} onChange={e=>setName(e.target.value)} placeholder="New name"/><Button disabled={!name.trim()} onClick={add}><Plus className="mr-2 size-4"/>Add</Button></CardContent></Card><div className="grid gap-4 md:grid-cols-2">{groups.map(([key,label])=><Card key={key}><CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{(data[key]||[]).map(x=><Badge variant="secondary" key={x.id}>{x.name}</Badge>)}{!(data[key]||[]).length&&<span className="text-sm text-muted-foreground">None yet</span>}</CardContent></Card>)}</div></div>
}









