"use client"

import { useEffect, useState } from "react"
import { History } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type AuditLog = { id: string; userName?: string | null; action: string; details?: string | null; date: string }
const actionLabel = (value: string) => value.replace(/^CARGO_|^ORDERS_/, "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())

export function ActivityTimeline({ entityType, entityId, allowed }: { entityType: string; entityId: string; allowed: boolean }) {
  const [logs, setLogs] = useState<AuditLog[] | null>(null)
  useEffect(() => { if (!allowed) return; void fetch(`/api/v1/audit-logs?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`).then(async response => response.ok ? response.json() : { logs: [] }).then(body => setLogs(body.logs || [])) }, [allowed, entityId, entityType])
  if (!allowed) return null
  return <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="size-4"/>Activity</CardTitle><p className="text-sm text-muted-foreground">Recorded changes to this record.</p></CardHeader><CardContent>{logs === null ? <p className="text-sm text-muted-foreground">Loading activity…</p> : logs.length ? <ol className="space-y-4 border-l pl-4">{logs.map(log => <li key={log.id} className="relative"><span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary"/><div className="text-sm font-medium">{actionLabel(log.action)}</div><div className="mt-1 text-xs text-muted-foreground">{log.userName || "System"} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.date))}</div></li>)}</ol> : <p className="text-sm text-muted-foreground">No recorded changes yet.</p>}</CardContent></Card>
}
