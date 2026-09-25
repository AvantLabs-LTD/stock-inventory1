"use client"

import { useMemo, useState } from "react"
import type { PlanningSnapshot } from "@/lib/planning-types"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** Scope stores explicit category IDs. Group toggles expand to descendants so
 * deselecting one family never accidentally leaves it included by its parent. */
export function PlanningCategoryPicker({categories,value,onChange}:{categories:PlanningSnapshot["categories"];value:string[]|null;onChange:(value:string[]|null)=>void}){
  const [query,setQuery]=useState("")
  const all=useMemo(()=>[...categories,{id:"UNCATEGORISED",name:"Uncategorised",parentId:null,discipline:"MECHANICAL" as const}],[categories])
  const selected=new Set(value??all.map(row=>row.id))
  const descendants=(id:string):string[]=>{const result=new Set([id]);let previous=0;while(previous!==result.size){previous=result.size;all.forEach(row=>{if(row.parentId&&result.has(row.parentId))result.add(row.id)})}return [...result]}
  const depth=(id:string)=>{let count=0,row=all.find(row=>row.id===id);const seen=new Set<string>();while(row?.parentId&&!seen.has(row.id)){seen.add(row.id);count++;row=all.find(parent=>parent.id===row?.parentId)}return count}
  function toggle(ids:string[],checked:boolean){const next=new Set(selected);ids.forEach(id=>checked?next.add(id):next.delete(id));onChange(next.size===all.length?null:[...next])}
  return <div className="space-y-3"><Input aria-label="Search category scope" placeholder="Find a group or family…" value={query} onChange={event=>setQuery(event.target.value)}/><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>onChange(null)}>Select all</Button><Button size="sm" variant="ghost" onClick={()=>onChange([])}>Clear</Button></div><div className="max-h-[45vh] space-y-2 overflow-y-auto">{all.filter(row=>row.name.toLowerCase().includes(query.toLowerCase())).map(row=>{const ids=descendants(row.id),count=ids.filter(id=>selected.has(id)).length;return <label key={row.id} className="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-muted" style={{marginLeft:depth(row.id)*16}}><Checkbox checked={count===ids.length?true:count?"indeterminate":false} onCheckedChange={checked=>toggle(ids,checked===true)}/><span>{row.name}</span>{ids.length>1&&<span className="ml-auto text-xs text-muted-foreground">{count}/{ids.length}</span>}</label>})}</div><p className="text-xs text-muted-foreground">Selecting a group includes its families. Unchecking a family excludes it from calculations and reports.</p></div>
}
