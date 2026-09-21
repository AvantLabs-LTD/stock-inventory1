"use client"

import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import type { ReactNode } from "react"

type ConfirmActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  destructive?: boolean
  busy?: boolean
  children?: ReactNode
}

/** A consistent, consequence-first guard for changes that cannot be casually undone. */
export function ConfirmActionDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, destructive = false, busy = false, children }: ConfirmActionDialogProps) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}><AlertDialogContent>
    <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
    {children && <div className="rounded-lg border bg-muted/25 p-3 text-sm">{children}</div>}
    <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction asChild><Button variant={destructive ? "destructive" : "default"} disabled={busy} onClick={event => { event.preventDefault(); void onConfirm() }}>{busy ? "Working…" : confirmLabel}</Button></AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>
}
