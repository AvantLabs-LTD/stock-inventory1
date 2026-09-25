"use client"

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { ReactNode } from "react"

export type SortDirection = "asc" | "desc"

export function nextSort(currentKey: string, currentDirection: SortDirection, key: string) {
  return currentKey === key ? { key, direction: currentDirection === "asc" ? "desc" as const : "asc" as const } : { key, direction: "asc" as const }
}

export function compareValues(left: unknown, right: unknown, direction: SortDirection) {
  const a = left ?? "", b = right ?? ""
  const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })
  return direction === "asc" ? comparison : -comparison
}

export function SortableColumnHeader({ children, active, direction, onClick, className = "" }: { children: ReactNode; active: boolean; direction: SortDirection; onClick: () => void; className?: string }) {
  const Icon = active ? direction === "asc" ? ArrowUp : ArrowDown : ChevronsUpDown
  return <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`} aria-label={`Sort by ${typeof children === "string" ? children : "column"}${active ? `, ${direction === "asc" ? "ascending" : "descending"}` : ""}`}>
    {children}<Icon className="size-3.5" aria-hidden="true"/>
  </button>
}
