"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { ComponentIdentity } from "@/components/shared/component-identity"

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
  description?: string | null
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
  const [rootCategoryId, setRootCategoryId] = useState("ALL")
  const [categoryId, setCategoryId] = useState("ALL")
  const selected = items.find(item => item.id === value)
  const rootCategories = categories.filter(category => !category.parentId)
  const categoryPaths = useMemo(() => {
    const byId = new Map(categories.map(category => [category.id, category]))
    return new Map(categories.map(category => {
      const path: CatalogueCategory[] = [], visited = new Set<string>()
      let current: CatalogueCategory | undefined = category
      while (current && !visited.has(current.id)) { path.unshift(current); visited.add(current.id); current = current.parentId ? byId.get(current.parentId) : undefined }
      return [category.id, path] as const
    }))
  }, [categories])
  const visibleCategories = categories.filter(category =>
    Boolean(category.parentId) &&
    (rootCategoryId === "ALL" || categoryPaths.get(category.id)?.[0]?.id === rootCategoryId)
  )
  const filtered = useMemo(() => items.filter(item =>
    (rootCategoryId === "ALL" || Boolean(item.category && categoryPaths.get(item.category.id)?.[0]?.id === rootCategoryId)) &&
    (categoryId === "ALL" || Boolean(item.category && categoryPaths.get(item.category.id)?.some(category => category.id === categoryId)))
  ), [items, rootCategoryId, categoryId, categoryPaths])
  const requestCategory = categoryId !== "ALL"
    ? categories.find(category => category.id === categoryId)
    : rootCategoryId !== "ALL"
      ? categories.find(category => category.id === rootCategoryId)
      : undefined

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" className="h-auto min-h-10 w-full justify-between py-2 text-left font-normal">
      {selected ? <span><span className="font-medium">{selected.title}</span><span className="block text-xs text-muted-foreground">{[selected.specification, selected.manufacturerPartNumber].filter(Boolean).join(" · ") || selected.unit}</span></span> : <span className="text-muted-foreground">{placeholder}</span>}
      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50"/>
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[min(42rem,calc(100vw-2rem))] p-0">
      <div className="grid grid-cols-2 gap-2 border-b p-2">
        <Select value={rootCategoryId} onValueChange={value => { setRootCategoryId(value); setCategoryId("ALL") }}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">All catalogue groups</SelectItem>{rootCategories.map(category=><SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select>
        <Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">All component families</SelectItem>{visibleCategories.map(category=><SelectItem key={category.id} value={category.id}>{categoryPaths.get(category.id)?.slice(1).map(part=>part.name).join(" / ")}</SelectItem>)}</SelectContent></Select>
      </div>
      <Command shouldFilter><CommandInput value={search} onValueChange={setSearch} placeholder="Type a name, specification, code, manufacturer or part number…"/>
        <CommandList>
          <CommandEmpty><div className="space-y-3 px-4"><p>No matching component found.</p>{onRequestNew&&search.trim()&&<Button type="button" size="sm" onClick={()=>{onRequestNew(search.trim(),requestCategory?.id||null,requestCategory?.discipline||null);setOpen(false)}}><Plus className="mr-2 size-4"/>Use “{search.trim()}” as a new component</Button>}</div></CommandEmpty>
          <CommandGroup heading={`${filtered.length} component${filtered.length===1?"":"s"}`}>
            {filtered.map(item=>{const path=item.category?categoryPaths.get(item.category.id)?.map(category=>category.name).join(" / "):null;return <CommandItem key={item.id} value={[item.id,item.code,item.title,item.specification,item.manufacturerName,item.manufacturerPartNumber,item.supplierPartNumber,path].filter(Boolean).join(" ")} onSelect={()=>{onValueChange(item.id);setOpen(false)}}>
              <Check className={cn("size-4",value===item.id?"opacity-100":"opacity-0")}/><ComponentIdentity className="min-w-0 flex-1" {...item}/>{item.catalogueState==="INCOMPLETE"&&<span className="text-xs text-amber-600">Needs review</span>}
            </CommandItem>})}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
