"use client"
import { useState } from "react"
import { Decimal } from "@prisma/client/runtime/index-browser"
import type { PlanningResult } from "@/lib/planning-types"

export function PlanningCostView({result}:{result:PlanningResult}){
  const [group,setGroup]=useState("component"),[currency,setCurrency]=useState("")
  const selected=result.totals.some(total=>total.currency===currency)?currency:result.totals[0]?.currency||""
  const costs=new Map<string,Decimal>()
  result.materials.filter(row=>row.item.price?.currency===selected).forEach(row=>{
    if(group==="project")row.contributions.forEach(entry=>costs.set(entry.project,(costs.get(entry.project)||new Decimal(0)).plus(new Decimal(entry.quantity).mul(row.item.price!.amount))))
    else {const key=group==="category"?row.category:row.item.title;costs.set(key,(costs.get(key)||new Decimal(0)).plus(row.cost||0))}
  })
  const rows=[...costs].sort((a,b)=>b[1].comparedTo(a[1])),max=rows[0]?.[1]||new Decimal(1)
  return <section className="space-y-4 rounded-xl border p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">What drives material cost?</h2><p className="text-sm text-muted-foreground">{result.materials.length-result.missingPrices} of {result.materials.length} components priced. Historical prices exclude labour, freight and duties.</p></div><div className="flex gap-2"><select aria-label="Group costs by" className="rounded border bg-background p-2" value={group} onChange={event=>setGroup(event.target.value)}><option value="component">Components</option><option value="category">Categories</option><option value="project">Projects</option></select><select aria-label="Cost currency" className="rounded border bg-background p-2" value={selected} onChange={event=>setCurrency(event.target.value)}>{result.totals.map(total=><option key={total.currency}>{total.currency}</option>)}</select></div></div>{rows.slice(0,10).map(([name,value])=><div key={name}><div className="mb-1 flex justify-between gap-4 text-sm"><span>{name}</span><span className="font-medium tabular-nums">{value.toString()} {selected}</span></div><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{width:`${max.isZero()?0:value.div(max).mul(100).toNumber()}%`}}/></div></div>)}{!rows.length&&<p className="py-6 text-muted-foreground">No historical prices are available for this scope.</p>}{rows.length>10&&<p className="text-xs text-muted-foreground">Top 10 contributors shown. All components remain available in the table below.</p>}</section>
}
