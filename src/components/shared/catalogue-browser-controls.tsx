"use client"

import { Filter, Layers3, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type CatalogueGroup = { id: string; name: string; discipline: "MECHANICAL" | "ELECTRONICS"; parentId?: string | null }

export function CatalogueBrowserControls({
  query, onQueryChange, groups, selectedGroupId, onSelectGroup, onOpenFilters, activeFilterCount = 0, scopeLabel = "All catalogue groups", onReset,
}: {
  query: string; onQueryChange: (value: string) => void; groups: CatalogueGroup[]; selectedGroupId: string; onSelectGroup: (id: string) => void
  onOpenFilters: () => void; activeFilterCount?: number; scopeLabel?: string; onReset?: () => void
}) {
  return <div className="space-y-3">
    <div className="flex flex-col gap-3 border-b bg-muted/15 p-4 lg:flex-row lg:items-center lg:p-5">
      <div className="relative min-w-0 flex-1"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="h-11 border-border/80 bg-background pl-10 shadow-xs" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Search components, specifications, part numbers, categories or families…"/></div>
      <Button className="h-11" type="button" variant="outline" onClick={onOpenFilters}><Filter className="mr-2 size-4"/>Filters{activeFilterCount > 0 && <Badge className="ml-2 min-w-5 justify-center rounded-full" variant="secondary">{activeFilterCount}</Badge>}</Button>
    </div>
    <div className="px-4 lg:px-5"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Layers3 className="size-3.5"/>Catalogue groups</div><div className="flex gap-2 overflow-x-auto pb-2"><button type="button" onClick={() => onSelectGroup("ALL")} className={`min-w-40 rounded-xl border px-4 py-3 text-left transition-all ${selectedGroupId === "ALL" ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-background hover:border-primary/40 hover:bg-muted/40"}`}><div className="text-sm font-semibold">All components</div><div className={`mt-1 text-xs ${selectedGroupId === "ALL" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>Entire catalogue</div></button>{groups.map(group => <button type="button" key={group.id} onClick={() => onSelectGroup(group.id)} className={`min-w-56 rounded-xl border px-4 py-3 text-left transition-all ${selectedGroupId === group.id ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-background hover:border-primary/40 hover:bg-muted/40"}`}><div className="line-clamp-1 text-sm font-semibold">{group.name}</div><div className={`mt-1 flex items-center gap-1.5 text-xs ${selectedGroupId === group.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}><span className={`size-1.5 rounded-full ${group.discipline === "MECHANICAL" ? "bg-amber-500" : "bg-sky-500"}`}/>{group.discipline === "MECHANICAL" ? "Mechanical" : "Electronics"}</div></button>)}</div></div>
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-5"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Current scope</span><Badge variant="secondary">{scopeLabel}</Badge></div>{onReset && (query || selectedGroupId !== "ALL" || activeFilterCount > 0) && <Button className="h-8 px-2 text-xs" variant="ghost" onClick={onReset}>Reset view</Button>}</div>
  </div>
}
