'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Boxes, ClipboardCheck, Loader2, RefreshCw, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAppStore } from '@/stores/app-store'

type Overview = {
  components: number
  onHand: string
  allocated: string
  freeStock: string
  openCycles: number
  submittedRequests: number
  pendingApproval: number
  physicalDeficit: string
  unprocuredDeficit: string
  affectedLines: number
  receivedToday: string
  issuedToday: string
  returnedToday: string
  recentMovements: Array<{ id: string; type: string; quantity: string; occurredAt: string; component: { code: string; title: string; unit: string }; actor: { name: string } }>
}

export function CanonicalOverviewPage() {
  const navigate = useAppStore((state) => state.navigate)
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const response = await fetch('/api/v1/overview')
    const body = await response.json().catch(() => ({}))
    setLoading(false)
    if (!response.ok) return toast.error(body.error ?? 'Unable to load overview')
    setData(body.data)
  }

  useEffect(() => { void load() }, [])

  return <div className="space-y-6">
    <PageHeader title="Operations overview" description="One view of physical stock, cycle demand, procurement, and immutable movements" icon={ArrowLeftRight}>
      <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 size-4" />Refresh</Button>
    </PageHeader>

    {loading ? <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin" /></div> : data && <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Physical on hand" value={data.onHand} note={`${data.freeStock} free · ${data.allocated} allocated`} icon={Boxes} onClick={() => navigate('inventory')} />
        <MetricCard title="Open demand" value={data.openCycles} note={`${data.submittedRequests} requests awaiting conversion`} icon={ClipboardCheck} onClick={() => navigate('reservations')} />
        <MetricCard title="Physical deficit" value={data.physicalDeficit} note={`${data.affectedLines} affected cycle lines`} icon={AlertTriangle} onClick={() => navigate('reservations')} />
        <MetricCard title="Unprocured deficit" value={data.unprocuredDeficit} note={`${data.pendingApproval} purchase requests await approval`} icon={ShoppingCart} onClick={() => navigate('purchase-requests')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="Received today" value={data.receivedToday} note="Posted to the canonical ledger" icon={ArrowDownToLine} />
        <MetricCard title="Issued today" value={data.issuedToday} note="Allocation consumed atomically" icon={ArrowUpFromLine} />
        <MetricCard title="Returned today" value={data.returnedToday} note="Reversed through immutable events" icon={RefreshCw} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent stock movements</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Component</TableHead><TableHead>Movement</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead>Actor</TableHead></TableRow></TableHeader><TableBody>
            {data.recentMovements.length === 0 ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No canonical movements have been posted.</TableCell></TableRow> : data.recentMovements.map((movement) => <TableRow key={movement.id}><TableCell>{new Date(movement.occurredAt).toLocaleString()}</TableCell><TableCell><div className="font-medium">{movement.component.title}</div><div className="font-mono text-xs text-muted-foreground">{movement.component.code}</div></TableCell><TableCell>{movement.type.replaceAll('_', ' ')}</TableCell><TableCell className="text-right font-mono">{movement.quantity} {movement.component.unit}</TableCell><TableCell>{movement.actor.name}</TableCell></TableRow>)}
          </TableBody></Table>
        </CardContent>
      </Card>
    </>}
  </div>
}

function MetricCard({ title, value, note, icon: Icon, onClick }: { title: string; value: string | number; note: string; icon: React.ElementType; onClick?: () => void }) {
  return <Card className={onClick ? 'cursor-pointer transition-shadow hover:shadow-md' : ''} onClick={onClick}><CardContent className="flex items-start justify-between p-5"><div><div className="text-sm text-muted-foreground">{title}</div><div className="mt-1 text-2xl font-bold tabular-nums">{value}</div><div className="mt-1 text-xs text-muted-foreground">{note}</div></div><div className="rounded-lg bg-muted p-2.5"><Icon className="size-5" /></div></CardContent></Card>
}
