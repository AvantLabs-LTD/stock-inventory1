"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type ComponentIdentityProps = {
  title: string
  specification?: string | null
  manufacturerPartNumber?: string | null
  description?: string | null
  code?: string | null
  discipline?: string | null
  unit?: string | null
  className?: string
}

export function ComponentIdentity({ title, specification, manufacturerPartNumber, description, code, discipline, unit, className }: ComponentIdentityProps) {
  const details = [specification, manufacturerPartNumber, !specification && discipline && unit ? `${discipline} · ${unit}` : null].filter(Boolean)
  return <Tooltip><TooltipTrigger asChild><div className={className}><div className="font-medium">{title}</div>{details.length > 0 && <div className="mt-0.5 text-xs text-muted-foreground">{details.join(" · ")}</div>}</div></TooltipTrigger><TooltipContent className="max-w-sm"><p>{description || "No description recorded."}</p>{code && <p className="mt-1 text-xs text-muted-foreground">Internal code: {code}</p>}</TooltipContent></Tooltip>
}
