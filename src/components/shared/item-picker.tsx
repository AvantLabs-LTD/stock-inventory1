"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type CatalogueCategory = {
  id: string
  name: string
  discipline: "MECHANICAL" | "ELECTRONICS"
  parentId?: string | null
  parent?: { id: string; name: string } | null
}

export type CatalogueItem = {
  id: string
  code: string
  title: string
  discipline: "MECHANICAL" | "ELECTRONICS"
  unit: string
  specification?: string | null
  manufacturerName?: string | null
  manufacturerPartNumber?: string | null
  supplierPartNumber?: string | null
  catalogueState?: "COMPLETE" | "INCOMPLETE"
  category?: CatalogueCategory | null
}

export function ItemPicker({
  items,
  categories,
  value,
  onValueChange,
  onRequestNew,
  placeholder = "Search by name, specification, code or part number…",
}: {
  items: CatalogueItem[]
  categories: CatalogueCategory[]
  value?: string | null
  onValueChange: (id: string | null) => void
  onRequestNew?: (title: string, categoryId: string | null, discipline: "MECHANICAL" | "ELECTRONICS" | null) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [discipline, setDiscipline] = useState<"ALL" | "MECHANICAL" | "ELECTRONICS">("ALL")
  const [categoryId, setCategoryId] = useState("ALL")
  const selected = items.find(item => item.id === value)
  const visibleCategories = categories.filter(category => discipline === "ALL" || category.discipline === discipline)
  const filtered = useMemo(() => items.filter(item =>
    (discipline === "ALL" || item.discipline === discipline) &&
    (categoryId === "ALL" || item.category?.id === categoryId || item.category?.parentId === categoryId)
  ), [items, discipline, categoryId])

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" className="h-auto min-h-10 w-full justify-between py-2 text-left font-normal">
      {selected ? <span><span className="font-medium">{selected.code} — {selected.title}</span>{selected.specification&&<span className="block text-xs text-muted-foreground">{selected.specification}</span>}</span> : <span className="text-muted-foreground">{placeholder}</span>}
      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50"/>
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[min(42rem,calc(100vw-2rem))] p-0">
      <div className="grid grid-cols-2 gap-2 border-b p-2">
        <Select value={discipline} onValueChange={value => { setDiscipline(value as typeof discipline); setCategoryId("ALL") }}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">All disciplines</SelectItem><SelectItem value="MECHANICAL">Mechanical</SelectItem><SelectItem value="ELECTRONICS">Electronics</SelectItem></SelectContent></Select>
        <Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">All categories</SelectItem>{visibleCategories.map(category=><SelectItem key={category.id} value={category.id}>{category.parent ? `${category.parent.name} / ` : ""}{category.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <Command shouldFilter><CommandInput value={search} onValueChange={setSearch} placeholder="Type a name, specification, code, manufacturer or part number…"/>
        <CommandList>
          <CommandEmpty><div className="space-y-3 px-4"><p>No matching component found.</p>{onRequestNew&&search.trim()&&<Button type="button" size="sm" onClick={()=>{onRequestNew(search.trim(),categoryId==="ALL"?null:categoryId,discipline==="ALL"?null:discipline);setOpen(false)}}><Plus className="mr-2 size-4"/>Use “{search.trim()}” as a new component</Button>}</div></CommandEmpty>
          <CommandGroup heading={`${filtered.length} component${filtered.length===1?"":"s"}`}>
            {filtered.map(item=><CommandItem key={item.id} value={[item.id,item.code,item.title,item.specification,item.manufacturerName,item.manufacturerPartNumber,item.supplierPartNumber,item.category?.name].filter(Boolean).join(" ")} onSelect={()=>{onValueChange(item.id);setOpen(false)}}>
              <Check className={cn("size-4",value===item.id?"opacity-100":"opacity-0")}/><div className="min-w-0 flex-1"><div className="truncate font-medium">{item.code} — {item.title}</div><div className="truncate text-xs text-muted-foreground">{[item.category?.name,item.specification,item.manufacturerPartNumber].filter(Boolean).join(" · ")||`${item.discipline} · ${item.unit}`}</div></div>{item.catalogueState==="INCOMPLETE"&&<span className="text-xs text-amber-600">Needs review</span>}
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
