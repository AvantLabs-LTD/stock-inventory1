"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/shared/page-header"
import { useAuthStore } from "@/stores/auth-store"

type Order = { id: string; source: string; orderNo: string; status: string; sourceStatus?: string | null; supplierName: string; submittedAt?: string | null; currency: string; paidAmount?: string | null; shippingAmount?: string | null; courierName?: string | null; trackingNumber?: string | null; vendor?: { name: string } | null; _count: { lines: number } }
const statuses = ["DRAFT", "PLACED", "PAID", "SUPPLIER_SHIPPED", "CLOSED", "CANCELLED"]
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())
const money = (value: string | null | undefined, currency: string) => value === null || value === undefined ? "—" : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${currency}`

export function OrdersPage() {
  const permissions = useAuthStore(state => state.user?.permissions || [])
  const canManage = permissions.includes("orders.manage")
  const [orders, setOrders] = useState<Order[]>([])
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("")
  const [total, setTotal] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  async function load() {
    const params = new URLSearchParams({ view: "orders", limit: "100" })
    if (q.trim()) params.set("q", q.trim())
    if (status) params.set("status", status)
    const response = await fetch(`/api/v1/orders?${params}`)
    const body = await response.json()
    if (!response.ok) return toast.error(body.error || "Could not load orders")
    setOrders(body.orders); setTotal(body.total)
  }
  useEffect(() => { void load() }, [q, status])

  async function create(form: FormData) {
    const body = { action: "order.create", data: { source: String(form.get("source") || "").trim(), orderNo: String(form.get("orderNo") || "").trim(), status: String(form.get("status") || "DRAFT"), supplierName: String(form.get("supplierName") || "").trim(), submittedAt: String(form.get("submittedAt") || "") || null, currency: String(form.get("currency") || "PKR").trim().toUpperCase(), paidAmount: String(form.get("paidAmount") || "") || null, shippingAmount: String(form.get("shippingAmount") || "") || null, courierName: String(form.get("courierName") || "") || null, trackingNumber: String(form.get("trackingNumber") || "") || null, notes: String(form.get("notes") || "") || null, lines: [{ description: String(form.get("lineDescription") || "").trim(), variant: String(form.get("variant") || "") || null, quantity: String(form.get("quantity") || "").trim(), unitPrice: String(form.get("unitPrice") || "") || null }] } }
    const response = await fetch("/api/v1/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const result = await response.json()
    if (!response.ok) return toast.error(result.error || "Could not create order")
    toast.success("Order created"); setCreateOpen(false); await load()
  }

  return <div className="space-y-5"><PageHeader title="Orders" description="Supplier and marketplace orders. Taobao is one source among many." icon={ShoppingCart}/>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-muted-foreground">{total} active orders</div>{canManage && <Button onClick={() => setCreateOpen(true)}>Create order</Button>}</div>
    <Card><CardHeader className="pb-3"><div className="flex flex-wrap gap-2"><Input className="w-full sm:w-80" value={q} onChange={event => setQ(event.target.value)} placeholder="Search order, supplier, or tracking"/><select aria-label="Order status" value={status} onChange={event => setStatus(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></div></CardHeader><CardContent><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Lines</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">Shipping</th><th className="px-4 py-3">Courier / tracking</th></tr></thead><tbody>{orders.map(order => <tr key={order.id} className="border-t"><td className="px-4 py-3 font-medium"><div>{order.orderNo}</div><div className="text-xs text-muted-foreground">{order.submittedAt ? new Date(order.submittedAt).toLocaleDateString() : "Date pending"}</div></td><td className="px-4 py-3">{order.source}</td><td className="px-4 py-3">{order.vendor?.name || order.supplierName}</td><td className="px-4 py-3"><Badge variant={order.status === "CANCELLED" ? "destructive" : "secondary"}>{label(order.status)}</Badge>{order.sourceStatus && <div className="mt-1 text-xs text-muted-foreground">Source: {order.sourceStatus}</div>}</td><td className="px-4 py-3 tabular-nums">{order._count.lines}</td><td className="px-4 py-3">{money(order.paidAmount, order.currency)}</td><td className="px-4 py-3">{money(order.shippingAmount, order.currency)}</td><td className="px-4 py-3 text-xs">{order.courierName || "—"}{order.trackingNumber && <div className="font-mono">{order.trackingNumber}</div>}</td></tr>)}{!orders.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No orders match the current filters.</td></tr>}</tbody></table></div></CardContent></Card>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Create order</DialogTitle><DialogDescription>Use the supplier's order reference. A marketplace is simply a source.</DialogDescription></DialogHeader><form className="space-y-3" onSubmit={event => { event.preventDefault(); void create(new FormData(event.currentTarget)) }}><div className="grid gap-3 sm:grid-cols-2"><Field name="source" label="Source" placeholder="Taobao, LCSC, Direct vendor…" required/><Field name="orderNo" label="Order reference" required/><Field name="supplierName" label="Supplier / store" required/><Field name="submittedAt" label="Order date" type="datetime-local"/><Select name="status" label="Status" options={statuses} defaultValue="DRAFT"/><Field name="currency" label="Currency" defaultValue="PKR" required/><Field name="paidAmount" label="Paid amount" type="number" step="0.0001"/><Field name="shippingAmount" label="Shipping amount" type="number" step="0.0001"/><Field name="courierName" label="Courier"/><Field name="trackingNumber" label="Tracking number"/></div><div className="border-t pt-3"><p className="mb-3 text-sm font-medium">First order line</p><div className="grid gap-3 sm:grid-cols-2"><Field name="lineDescription" label="Description" required/><Field name="variant" label="Variant"/><Field name="quantity" label="Quantity" type="number" step="0.001" required/><Field name="unitPrice" label="Unit price" type="number" step="0.0001"/></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit">Create order</Button></DialogFooter></form></DialogContent></Dialog>
  </div>
}

function Field({ name, label, type = "text", placeholder, defaultValue, required = false, step }: { name: string; label: string; type?: string; placeholder?: string; defaultValue?: string; required?: boolean; step?: string }) { return <div className="space-y-1"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={required} step={step}/></div> }
function Select({ name, label: fieldLabel, options, defaultValue }: { name: string; label: string; options: string[]; defaultValue: string }) { return <div className="space-y-1"><Label htmlFor={name}>{fieldLabel}</Label><select id={name} name={name} defaultValue={defaultValue} className="flex h-9 w-full rounded-md border bg-background px-3 text-sm">{options.map(option => <option key={option} value={option}>{label(option)}</option>)}</select></div> }
