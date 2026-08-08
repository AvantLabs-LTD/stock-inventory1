'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Loader2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

interface SpecRow {
  id: string
  specification: string
  unit: string
  minimumStock: string
  unitCost: string
}

interface AddItemModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  initialItemName?: string
}

const UNITS = ['pcs', 'roll', 'mtr', 'core', 'kg', 'box', 'set']

export function AddItemModal({ open, onOpenChange, onSuccess, initialItemName }: AddItemModalProps) {
  const [itemName, setItemName] = useState('')
  const [existingNames, setExistingNames] = useState<string[]>([])
  const [specs, setSpecs] = useState<SpecRow[]>([
    { id: crypto.randomUUID(), specification: '', unit: 'pcs', minimumStock: '0', unitCost: '0' },
  ])
  const [submitting, setSubmitting] = useState(false)

  // Load existing item names for autocomplete
  useEffect(() => {
    if (!open) return
    fetch('/api/inventory-items?limit=9999')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.itemNames) setExistingNames(json.itemNames)
      })
      .catch(() => {})
  }, [open])

  // Set initial item name
  useEffect(() => {
    if (open && initialItemName) setItemName(initialItemName)
  }, [open, initialItemName])

  // Reset form on close
  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setItemName('')
        setSpecs([{ id: crypto.randomUUID(), specification: '', unit: 'pcs', minimumStock: '0', unitCost: '0' }])
      }
      onOpenChange(isOpen)
    },
    [onOpenChange],
  )

  const addSpecRow = () => {
    setSpecs((prev) => [
      ...prev,
      { id: crypto.randomUUID(), specification: '', unit: 'pcs', minimumStock: '0', unitCost: '0' },
    ])
  }

  const removeSpecRow = (id: string) => {
    if (specs.length <= 1) return
    setSpecs((prev) => prev.filter((s) => s.id !== id))
  }

  const updateSpec = (id: string, field: keyof SpecRow, value: string) => {
    setSpecs((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }

  const handleSubmit = async () => {
    const trimmedName = itemName.trim()
    if (!trimmedName) {
      toast.error('Please enter an Item Name')
      return
    }

    const validSpecs = specs.filter((s) => s.specification.trim())
    if (validSpecs.length === 0) {
      toast.error('Please add at least one specification')
      return
    }

    for (const s of validSpecs) {
      if (!s.specification.trim()) {
        toast.error('Specification cannot be empty')
        return
      }
    }

    setSubmitting(true)
    try {
      const items = validSpecs.map((s) => ({
        itemName: trimmedName,
        specification: s.specification.trim(),
        unit: s.unit || 'pcs',
        minimumStock: parseInt(s.minimumStock, 10) || 0,
        unitCost: parseFloat(s.unitCost) || 0,
        warehouse: 'Main Warehouse',
      }))

      const res = await fetch('/api/inventory-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })

      if (res.ok) {
        const json = await res.json()
        const createdCount = json.created?.length || 0
        const errorCount = json.errors?.length || 0
        if (createdCount > 0) {
          toast.success(`Added ${createdCount} item${createdCount > 1 ? 's' : ''} to ${trimmedName}`)
          handleClose(false)
          onSuccess()
        }
        if (errorCount > 0) {
          toast.warning(`${errorCount} item${errorCount > 1 ? 's were' : ' was'} skipped (already exists)`, {
            description: json.errors.map((e: { specification: string }) => e.specification).join(', '),
          })
        }
        if (createdCount === 0 && errorCount > 0) {
          toast.info('All items already exist')
        }
      } else {
        toast.error('Failed to add items')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
          <DialogDescription>
            Create a new item with one or more specifications. Example: &quot;Connector&quot; with specs like XT30-M, XT60-F, etc.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Item Name with datalist for autocomplete */}
          <div className="space-y-2">
            <Label htmlFor="item-name">Item Name</Label>
            <div className="relative">
              <Input
                id="item-name"
                placeholder="e.g. Connector, Braided Sleeve..."
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                list="existing-item-names"
                autoFocus
              />
              <datalist id="existing-item-names">
                {existingNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Specifications Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Specifications</Label>
              <Button variant="ghost" size="sm" onClick={addSpecRow} className="h-7 text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Specification</th>
                      <th className="text-left px-3 py-2 font-medium w-[100px]">Unit</th>
                      <th className="text-right px-3 py-2 font-medium w-[100px]">Min Stock</th>
                      <th className="text-right px-3 py-2 font-medium w-[100px]">Unit Cost</th>
                      <th className="w-[40px]" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {specs.map((spec, idx) => (
                      <tr key={spec.id}>
                        <td className="px-2 py-1.5">
                          {idx === 0 ? (
                            <Input
                              className="h-8 text-sm"
                              placeholder="e.g. XT30-M"
                              value={spec.specification}
                              onChange={(e) => updateSpec(spec.id, 'specification', e.target.value)}
                              autoFocus
                            />
                          ) : (
                            <Input
                              className="h-8 text-sm"
                              placeholder="e.g. XT60-F"
                              value={spec.specification}
                              onChange={(e) => updateSpec(spec.id, 'specification', e.target.value)}
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={spec.unit} onValueChange={(v) => updateSpec(spec.id, 'unit', v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNITS.map((u) => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min="0"
                            className="h-8 text-sm text-right"
                            placeholder="0"
                            value={spec.minimumStock}
                            onChange={(e) => updateSpec(spec.id, 'minimumStock', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 text-sm text-right"
                            placeholder="0.00"
                            value={spec.unitCost}
                            onChange={(e) => updateSpec(spec.id, 'unitCost', e.target.value)}
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeSpecRow(spec.id)}
                            disabled={specs.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
