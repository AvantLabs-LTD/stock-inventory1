'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Plus,
  Trash2,
  Loader2,
  CalendarDays,
  Building2,
  FolderKanban,
  User,
  Package,
  Search,
} from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Department {
  id: string
  name: string
  code: string
}

interface Project {
  id: string
  name: string
  code: string
  departmentId: string
}

interface Product {
  id: string
  name: string
  code: string
  sku: string
  unit: string
}

interface RequisitionLineItem {
  _key: number // client-side only for React keys
  productId: string
  specDescription: string
  requiredQty: number
  remarks: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MaterialRequisitionForm({ open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')

  // Header fields
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [departmentId, setDepartmentId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [employeeName, setEmployeeName] = useState('')

  // Table line items
  const [items, setItems] = useState<RequisitionLineItem[]>([])
  let nextKey = 0

  // ─── Load reference data when dialog opens ───────────────────────────────
  useEffect(() => {
    if (!open) return
    setDate(format(new Date(), 'yyyy-MM-dd'))
    setDepartmentId('')
    setProjectId('')
    setEmployeeName('')
    setProductSearch('')
    setItems([{ _key: 0, productId: '', specDescription: '', requiredQty: 0, remarks: '' }])

    fetch('/api/departments?limit=200&status=ACTIVE')
      .then((r) => r.json())
      .then((d) => setDepartments(d.data || []))
      .catch(() => {})

    fetch('/api/products?limit=500&status=ACTIVE')
      .then((r) => r.json())
      .then((d) => setProducts(d.data || []))
      .catch(() => {})
  }, [open])

  // ─── Load projects when department changes ──────────────────────────────
  useEffect(() => {
    if (!departmentId) {
      setProjects([])
      setProjectId('')
      return
    }
    fetch(`/api/projects?limit=200&departmentId=${departmentId}&status=ACTIVE`)
      .then((r) => r.json())
      .then((d) => setProjects(d.data || []))
      .catch(() => setProjects([]))
    setProjectId('')
  }, [departmentId])

  // ─── Item helpers ─────────────────────────────────────────────────────────
  const addItem = () => {
    const maxKey = items.reduce((max, item) => Math.max(max, item._key), -1)
    setItems([...items, { _key: maxKey + 1, productId: '', specDescription: '', requiredQty: 0, remarks: '' }])
  }

  const removeItem = (key: number) => {
    if (items.length <= 1) {
      toast.error('At least one item is required')
      return
    }
    setItems(items.filter((item) => item._key !== key))
  }

  const updateItem = (key: number, field: keyof RequisitionLineItem, value: string | number) => {
    setItems(items.map((item) => (item._key === key ? { ...item, [field]: value } : item)))
  }

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase())
  )

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    // Validate
    if (!departmentId) { toast.error('Please select a department'); return }
    if (!projectId) { toast.error('Please select a project'); return }
    if (!employeeName.trim()) { toast.error('Please enter employee name'); return }

    const validItems = items.filter((item) => item.productId && item.requiredQty > 0)
    if (validItems.length === 0) {
      toast.error('Add at least one item with a product and quantity')
      return
    }

    // Check for duplicate products
    const productIds = validItems.map((i) => i.productId)
    if (new Set(productIds).size !== productIds.length) {
      toast.error('Duplicate products found. Each product can only appear once.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          departmentId,
          projectId,
          employeeName: employeeName.trim(),
          items: validItems.map((item) => ({
            productId: item.productId,
            specDescription: item.specDescription || null,
            requiredQty: item.requiredQty,
            remarks: item.remarks || null,
          })),
        }),
      })
      if (res.ok) {
        toast.success('Material Requisition submitted successfully')
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to submit requisition')
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [date, departmentId, projectId, employeeName, items, onSuccess, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-center font-bold tracking-wider uppercase">
            Material Requisition Form
          </DialogTitle>
          <DialogDescription className="text-center">
            Fill in the items your team needs. All fields marked * are required.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* ─── Header Fields ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border rounded-lg bg-muted/30">
            <div>
              <Label className="text-xs flex items-center gap-1">
                <CalendarDays className="size-3 text-muted-foreground" />
                Date *
              </Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Building2 className="size-3 text-muted-foreground" />
                Department *
              </Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select dept" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <FolderKanban className="size-3 text-muted-foreground" />
                Project *
              </Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={departmentId ? 'Select project' : 'Select dept first'} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {projects.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      {departmentId ? 'No projects found' : 'Select a department first'}
                    </div>
                  ) : (
                    projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <User className="size-3 text-muted-foreground" />
                Employee Name *
              </Label>
              <Input
                placeholder="Name of requester"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* ─── Items Table ────────────────────────────────────────────────── */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[50px] text-center font-semibold">S/No</TableHead>
                  <TableHead className="min-w-[180px] font-semibold">Item Name</TableHead>
                  <TableHead className="min-w-[130px] font-semibold">Spec / Description</TableHead>
                  <TableHead className="w-[100px] text-center font-semibold">Req Qty</TableHead>
                  <TableHead className="min-w-[100px] font-semibold">Remarks</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => {
                  const selectedProduct = products.find((p) => p.id === item.productId)
                  return (
                    <TableRow key={item._key}>
                      <TableCell className="text-center font-mono text-sm text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.productId}
                          onValueChange={(v) => updateItem(item._key, 'productId', v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            <div className="p-2 border-b">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                <Input
                                  placeholder="Search products..."
                                  className="h-8 pl-8"
                                  value={productSearch}
                                  onChange={(e) => setProductSearch(e.target.value)}
                                />
                              </div>
                            </div>
                            {filteredProducts.length === 0 ? (
                              <div className="p-3 text-center text-xs text-muted-foreground">No products found</div>
                            ) : (
                              filteredProducts.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  <span className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] text-muted-foreground">{p.code}</span>
                                    <span className="text-sm">{p.name}</span>
                                  </span>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {selectedProduct && (
                          <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                            Unit: {selectedProduct.unit}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-9"
                          placeholder="e.g., (B)/1001"
                          value={item.specDescription}
                          onChange={(e) => updateItem(item._key, 'specDescription', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-9 text-center"
                          min={1}
                          value={item.requiredQty || ''}
                          onChange={(e) => updateItem(item._key, 'requiredQty', Number(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-9"
                          placeholder="—"
                          value={item.remarks}
                          onChange={(e) => updateItem(item._key, 'remarks', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(item._key)}
                          disabled={items.length <= 1}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* ─── Add Row Button ─────────────────────────────────────────────── */}
          <Button
            variant="outline"
            size="sm"
            onClick={addItem}
            className="w-full border-dashed"
          >
            <Plus className="mr-2 size-4" />
            Add Item Row
          </Button>

          {/* ─── Summary ────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between text-sm px-1">
            <span className="text-muted-foreground">
              <Package className="inline size-3.5 mr-1" />
              {items.filter((i) => i.productId && i.requiredQty > 0).length} item(s) with valid data
            </span>
            <span className="font-semibold">
              Total Required: {items.reduce((sum, i) => sum + (i.requiredQty || 0), 0)}
            </span>
          </div>
        </div>

        {/* ─── Footer ──────────────────────────────────────────────────────── */}
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Submit Requisition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
