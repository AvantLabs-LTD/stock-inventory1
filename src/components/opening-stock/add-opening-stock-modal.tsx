'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Search,
  X,
  PackageSearch,
  AlertCircle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductItem {
  id: string
  name: string
  code: string
  sku: string
  unit: string
  status: string
  categoryId: string | null
  brand: string | null
  parentProductId: string | null
  variantName: string | null
  category: { id: string; name: string } | null
  parent: { id: string; name: string } | null
}

interface CategoryItem {
  id: string
  name: string
}

interface ProjectField {
  id: string
  name: string
  code: string
}

interface ProjectQtyRow {
  projectFieldId: string
  requiredQty: number
  batchQty: number
  reservedQty: number
  consumedQty: number
  orderedQty: number
  toBeUsed: number
  remarks: string
}

interface EditEntry {
  id: string
  productId: string
  warehouse: string | null
  storageLocation: string | null
  quantity: number
  unitCost: number
  batchNumber: string | null
  serialNumber: string | null
  expiryDate: string | null
  remarks: string | null
  internalNotes: string | null
  openingDate: string
  projectQtys: Array<{
    id: string
    projectFieldId: string
    requiredQty: number
    batchQty: number
    reservedQty: number
    consumedQty: number
    orderedQty: number
    toBeUsed: number
    remarks: string | null
  }>
}

interface AddOpeningStockModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  projectFields: ProjectField[]
  editEntry?: EditEntry | null
}

const WAREHOUSES = [
  { value: 'Main Warehouse', label: 'Main Warehouse' },
  { value: 'Raw Material', label: 'Raw Material' },
  { value: 'SMD Line', label: 'SMD Line' },
  { value: 'Stores', label: 'Stores' },
]

// ─── Main Component ──────────────────────────────────────────────────────────

export function AddOpeningStockModal({
  open,
  onOpenChange,
  onSaved,
  projectFields,
  editEntry,
}: AddOpeningStockModalProps) {
  const isEdit = !!editEntry

  // ─── Product Search ────────────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<ProductItem[]>([])
  const [productSearchLoading, setProductSearchLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null)
  const [showProductCreate, setShowProductCreate] = useState(false)

  // ─── Form Fields ───────────────────────────────────────────────────────
  const [warehouse, setWarehouse] = useState('')
  const [storageLocation, setStorageLocation] = useState('')
  const [openingQty, setOpeningQty] = useState<number>(0)
  const [unitCost, setUnitCost] = useState<number>(0)
  const [batchNumber, setBatchNumber] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [purchaseRef, setPurchaseRef] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [receivedDate, setReceivedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [openingDate, setOpeningDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [remarks, setRemarks] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [projectQtys, setProjectQtys] = useState<ProjectQtyRow[]>([])

  // ─── Quick Create Product ─────────────────────────────────────────────
  const [newProductName, setNewProductName] = useState('')
  const [newProductCategory, setNewProductCategory] = useState('')
  const [newProductUnit, setNewProductUnit] = useState('pcs')
  const [newProductVariantName, setNewProductVariantName] = useState('')
  const [newProductParentId, setNewProductParentId] = useState('')
  const [creatingProduct, setCreatingProduct] = useState(false)

  // ─── Categories ──────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<CategoryItem[]>([])

  // ─── Section Collapse ──────────────────────────────────────────────────
  const [sectionsOpen, setSectionsOpen] = useState({
    product: true,
    inventory: true,
    projects: false,
    additional: false,
  })

  // ─── Submit ─────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)

  // ─── Computed values ──────────────────────────────────────────────────
  const inventoryValue = openingQty * unitCost

  // ─── Initialize from edit entry ────────────────────────────────────────
  useEffect(() => {
    if (editEntry && open) {
      // Set edit-only fields
      setBatchNumber(editEntry.batchNumber || '')
      setSerialNumber(editEntry.serialNumber || '')
      setExpiryDate(editEntry.expiryDate ? format(new Date(editEntry.expiryDate), 'yyyy-MM-dd') : '')
      setStorageLocation(editEntry.storageLocation || '')
      setRemarks(editEntry.remarks || '')
      setInternalNotes(editEntry.internalNotes || '')
      setOpeningDate(editEntry.openingDate ? format(new Date(editEntry.openingDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'))
      setWarehouse(editEntry.warehouse || '')
      setOpeningQty(editEntry.quantity)
      setUnitCost(editEntry.unitCost)

      // Set project quantities
      const pqRows = projectFields.map((pf) => {
        const existing = editEntry.projectQtys?.find((pq) => pq.projectFieldId === pf.id)
        return {
          projectFieldId: pf.id,
          requiredQty: existing?.requiredQty || 0,
          batchQty: existing?.batchQty || 0,
          reservedQty: existing?.reservedQty || 0,
          consumedQty: existing?.consumedQty || 0,
          orderedQty: existing?.orderedQty || 0,
          toBeUsed: existing?.toBeUsed || 0,
          remarks: existing?.remarks || '',
        }
      })
      setProjectQtys(pqRows)

      // Search and select the product (best effort)
      setProductSearch('')
      setSelectedProduct(null)
      // We need to fetch the product info
      fetch(`/api/products/${editEntry.productId}`)
        .then((r) => {
          if (r.ok) return r.json()
          return null
        })
        .then((data) => {
          if (data) {
            setSelectedProduct({
              id: data.id,
              name: data.name,
              code: data.code,
              sku: data.sku,
              unit: data.unit,
              status: data.status,
              categoryId: data.categoryId,
              brand: data.brand,
              parentProductId: data.parentProductId,
              variantName: data.variantName,
              category: data.category,
              parent: data.parent,
            })
          }
        })
        .catch(() => {})
    }
  }, [editEntry, open, projectFields])

  // ─── Reset on open for create mode ────────────────────────────────────
  useEffect(() => {
    if (open && !editEntry) {
      setProductSearch('')
      setProductResults([])
      setSelectedProduct(null)
      setShowProductCreate(false)
      setWarehouse('')
      setStorageLocation('')
      setOpeningQty(0)
      setUnitCost(0)
      setBatchNumber('')
      setSerialNumber('')
      setExpiryDate('')
      setPurchaseRef('')
      setInvoiceNumber('')
      setReceivedDate(format(new Date(), 'yyyy-MM-dd'))
      setOpeningDate(format(new Date(), 'yyyy-MM-dd'))
      setRemarks('')
      setInternalNotes('')
      setNewProductName('')
      setNewProductCategory('')
      setNewProductUnit('pcs')
      setNewProductVariantName('')
      setNewProductParentId('')
      setProjectQtys(
        projectFields.map((pf) => ({
          projectFieldId: pf.id,
          requiredQty: 0,
          batchQty: 0,
          reservedQty: 0,
          consumedQty: 0,
          orderedQty: 0,
          toBeUsed: 0,
          remarks: '',
        }))
      )
      setSectionsOpen({ product: true, inventory: true, projects: false, additional: false })
    }
  }, [open, editEntry, projectFields])

  // ─── Fetch categories ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const fetchRefs = async () => {
      try {
        const cRes = await fetch('/api/categories?limit=500')
        if (cRes.ok) {
          const cJson = await cRes.json()
          setCategories(cJson.data || [])
        }
      } catch {
        // ignore
      }
    }
    fetchRefs()
  }, [open])

  // ─── Product Search ────────────────────────────────────────────────────
  const handleProductSearch = useCallback(async (query: string) => {
    setProductSearch(query)
    setSelectedProduct(null)
    if (!query || query.length < 2) {
      setProductResults([])
      return
    }
    setProductSearchLoading(true)
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=20&status=ACTIVE`)
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      setProductResults(json.data || [])
    } catch {
      setProductResults([])
    } finally {
      setProductSearchLoading(false)
    }
  }, [])

  const handleSelectProduct = useCallback((product: ProductItem) => {
    setSelectedProduct(product)
    setProductSearch(product.name)
    setProductResults([])
    setShowProductCreate(false)
  }, [editEntry])

  // ─── Quick Create Product ──────────────────────────────────────────────
  const handleQuickCreate = useCallback(async () => {
    if (!newProductName.trim()) return
    setCreatingProduct(true)
    try {
      const body: Record<string, unknown> = {
        name: newProductName.trim(),
        unit: newProductUnit,
        categoryId: newProductCategory || undefined,
        variantName: newProductVariantName || undefined,
        parentProductId: newProductParentId || undefined,
      }
      const res = await fetch('/api/opening-stock/products/quick-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create product')
      }
      const product = await res.json()
      toast.success(`Product "${product.name}" created`)
      handleSelectProduct({
        id: product.id,
        name: product.name,
        code: product.code,
        sku: product.sku,
        unit: product.unit,
        status: 'ACTIVE',
        categoryId: product.categoryId,
        brand: null,
        parentProductId: product.parentProductId,
        variantName: product.variantName,
        category: null,
        parent: null,
      })
      setShowProductCreate(false)
      setNewProductName('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create product')
    } finally {
      setCreatingProduct(false)
    }
  }, [newProductName, newProductUnit, newProductCategory, newProductVariantName, newProductParentId, handleSelectProduct])

  // ─── Project Qty Update ────────────────────────────────────────────────
  const updateProjectQty = useCallback((idx: number, field: keyof ProjectQtyRow, value: number | string) => {
    setProjectQtys((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }, [])

  // ─── Toggle Section ───────────────────────────────────────────────────
  const toggleSection = useCallback((key: keyof typeof sectionsOpen) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [sectionsOpen])

  // ─── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!selectedProduct && !editEntry) {
      toast.error('Please select a product')
      return
    }
    if (!isEdit && openingQty <= 0) {
      toast.error('Opening quantity must be greater than 0')
      return
    }

    setSubmitting(true)
    try {
      if (isEdit && editEntry) {
        // Edit mode - only limited fields
        const updateData: Record<string, unknown> = {
          remarks,
          internalNotes,
          batchNumber: batchNumber || null,
          serialNumber: serialNumber || null,
          expiryDate: expiryDate || null,
          storageLocation: storageLocation || null,
        }

        const res = await fetch(`/api/opening-stock/${editEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to update')
        }
        toast.success('Opening stock updated')
      } else {
        // Create mode
        const body: Record<string, unknown> = {
          productId: selectedProduct!.id,
          quantity: openingQty,
          unitCost,
          warehouse: warehouse || null,
          storageLocation: storageLocation || null,
          batchNumber: batchNumber || null,
          serialNumber: serialNumber || null,
          expiryDate: expiryDate || null,
          purchaseReference: purchaseRef || null,
          invoiceNumber: invoiceNumber || null,
          receivedDate: receivedDate || null,
          openingDate: openingDate || null,
          remarks: remarks || null,
          internalNotes: internalNotes || null,
          projectQtys: projectQtys
            .filter((pq) => pq.requiredQty > 0)
            .map((pq) => ({
              projectFieldId: pq.projectFieldId,
              requiredQty: pq.requiredQty,
              batchQty: pq.batchQty,
              reservedQty: pq.reservedQty,
              consumedQty: pq.consumedQty,
              orderedQty: pq.orderedQty,
              toBeUsed: pq.toBeUsed,
              remarks: pq.remarks || null,
            })),
        }

        const res = await fetch('/api/opening-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to create')
        }
        toast.success('Opening stock created successfully')
      }

      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setSubmitting(false)
    }
  }, [
    selectedProduct,
    editEntry,
    isEdit,
    openingQty,
    unitCost,
    warehouse,
    storageLocation,
    batchNumber,
    serialNumber,
    expiryDate,
    purchaseRef,
    invoiceNumber,
    receivedDate,
    openingDate,
    remarks,
    internalNotes,
    projectQtys,
    onOpenChange,
    onSaved,
  ])

  // ─── Section Component ──────────────────────────────────────────────────
  const SectionHeader = ({
    sectionKey,
    title,
    subtitle,
    badge,
  }: {
    sectionKey: keyof typeof sectionsOpen
    title: string
    subtitle?: string
    badge?: string
  }) => (
    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        {badge && (
          <Badge variant="secondary" className="text-xs">
            {badge}
          </Badge>
        )}
      </div>
      {sectionsOpen[sectionKey] ? (
        <ChevronUp className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      )}
    </CollapsibleTrigger>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Opening Stock' : 'Add Opening Stock'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update inventory metadata and project quantities.' : 'Create a new opening stock entry for inventory.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* ─── 1. Product Information ─────────────────────────────────── */}
          <Collapsible open={sectionsOpen.product} onOpenChange={() => toggleSection('product')}>
            <SectionHeader
              sectionKey="product"
              title="Product Information"
              subtitle="Search and select the product"
              badge={selectedProduct ? 'Selected' : undefined}
            />
            <CollapsibleContent className="space-y-4 pt-3 px-1">
              {!showProductCreate ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by product name, SKU, or code..."
                      value={isEdit && selectedProduct ? selectedProduct.name : productSearch}
                      onChange={(e) => {
                        if (isEdit) return // no change in edit mode
                        handleProductSearch(e.target.value)
                      }}
                      className="pl-9"
                      disabled={isEdit}
                    />
                    {productSearchLoading && (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  {/* Search Results Dropdown */}
                  {productResults.length > 0 && !selectedProduct && (
                    <div className="rounded-md border bg-background shadow-lg max-h-48 overflow-y-auto">
                      {productResults.map((p) => (
                        <button
                          key={p.id}
                          className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                          onClick={() => handleSelectProduct(p)}
                        >
                          <div>
                            <p className="font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.code} | {p.sku} | {p.category?.name || 'No Category'}
                              {p.parentProductId && ` (Variant: ${p.variantName || 'N/A'})`}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {p.unit}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Product not found + create prompt */}
                  {productSearch.length >= 2 && !productSearchLoading && productResults.length === 0 && !selectedProduct && (
                    <div className="flex items-center gap-2 rounded-md border border-dashed p-3">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span className="text-sm text-muted-foreground">
                        Product not found.{' '}
                        <button
                          className="text-primary font-medium hover:underline"
                          onClick={() => setShowProductCreate(true)}
                        >
                          Create Product?
                        </button>
                      </span>
                    </div>
                  )}

                  {/* Selected Product Info */}
                  {selectedProduct && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                          {selectedProduct.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{selectedProduct.name}</p>
                          <p className="text-xs text-muted-foreground">{selectedProduct.code} | {selectedProduct.sku}</p>
                        </div>
                        {!isEdit && (
                          <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={() => { setSelectedProduct(null); setProductSearch('') }}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Category: </span>
                          <span className="font-medium">{selectedProduct.category?.name || '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Brand: </span>
                          <span className="font-medium">{selectedProduct.brand || '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Unit: </span>
                          <span className="font-medium">{selectedProduct.unit}</span>
                        </div>
                      </div>
                      {selectedProduct.parentProductId && (
                        <p className="text-xs text-muted-foreground">
                          Variant of: <span className="font-medium">{selectedProduct.parent?.name || 'Unknown'}</span>
                          {selectedProduct.variantName && ` (${selectedProduct.variantName})`}
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* Quick Create Product */
                <div className="space-y-3 rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Create New Product</h4>
                    <Button variant="ghost" size="sm" onClick={() => setShowProductCreate(false)}>
                      <X className="mr-1 h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs">Product Name *</Label>
                      <Input
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        placeholder="Enter product name"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Category</Label>
                      <Select value={newProductCategory} onValueChange={setNewProductCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Category</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Unit</Label>
                      <Select value={newProductUnit} onValueChange={setNewProductUnit}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['pcs', 'kg', 'm', 'mtr', 'pcs', 'set', 'lot', 'box', 'roll', 'pack'].map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Variant Name (optional)</Label>
                      <Input
                        value={newProductVariantName}
                        onChange={(e) => setNewProductVariantName(e.target.value)}
                        placeholder="e.g., 10K, 100nF"
                      />
                    </div>
                  </div>
                  <Button onClick={handleQuickCreate} disabled={!newProductName.trim() || creatingProduct}>
                    {creatingProduct && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Plus className="mr-2 h-4 w-4" />
                    Create Product
                  </Button>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* ─── 2. Inventory Information ───────────────────────────────── */}
          <Collapsible open={sectionsOpen.inventory} onOpenChange={() => toggleSection('inventory')}>
            <SectionHeader sectionKey="inventory" title="Inventory Information" subtitle="Warehouse, quantities, and costs" />
            <CollapsibleContent className="space-y-4 pt-3 px-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Warehouse</Label>
                  <Select value={warehouse} onValueChange={setWarehouse}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {WAREHOUSES.map((w) => (
                        <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Storage Location</Label>
                  <Input value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} placeholder="e.g., Shelf A-1, Bin 12" />
                </div>
                <div>
                  <Label className="text-xs">
                    Opening Quantity {isEdit ? '' : '*'}
                  </Label>
                  <Input
                    type="number"
                    value={openingQty || ''}
                    onChange={(e) => setOpeningQty(Number(e.target.value) || 0)}
                    placeholder="0"
                    disabled={isEdit}
                    min={0}
                  />
                  {isEdit && (
                    <p className="text-xs text-muted-foreground mt-1">Cannot be edited. Use stock adjustments.</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Unit Cost</Label>
                  <Input
                    type="number"
                    value={unitCost || ''}
                    onChange={(e) => setUnitCost(Number(e.target.value) || 0)}
                    placeholder="0.00"
                    disabled={isEdit}
                    min={0}
                    step={0.01}
                  />
                  {isEdit && (
                    <p className="text-xs text-muted-foreground mt-1">Cannot be edited after creation.</p>
                  )}
                </div>
              </div>

              {/* Inventory Value */}
              <div className="rounded-md bg-muted/50 border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Calculated Inventory Value</span>
                  <span className="text-lg font-bold text-primary">
                    ${inventoryValue.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Batch Number</Label>
                  <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="e.g., BATCH-001" />
                </div>
                <div>
                  <Label className="text-xs">Serial Number</Label>
                  <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="e.g., SN-001" />
                </div>
                <div>
                  <Label className="text-xs">Expiry Date</Label>
                  <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* ─── 3. Project Quantities ─────────────────────────────────── */}
          {projectFields.length > 0 && (
            <Collapsible open={sectionsOpen.projects} onOpenChange={() => toggleSection('projects')}>
              <SectionHeader
                sectionKey="projects"
                title="Project Quantities"
                subtitle="Assign quantities to projects"
                badge={`${projectFields.length} projects`}
              />
              <CollapsibleContent className="space-y-3 pt-3 px-1">
                {projectFields.map((pf, idx) => {
                  const pq = projectQtys[idx]
                  if (!pq) return null
                  return (
                    <div key={pf.id} className="rounded-md border p-3">
                      <p className="text-sm font-medium mb-2">{pf.name} <span className="text-xs text-muted-foreground">({pf.code})</span></p>
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs">Required</Label>
                          <Input type="number" value={pq.requiredQty || ''} onChange={(e) => updateProjectQty(idx, 'requiredQty', Number(e.target.value) || 0)} min={0} />
                        </div>
                        <div>
                          <Label className="text-xs">Batch</Label>
                          <Input type="number" value={pq.batchQty || ''} onChange={(e) => updateProjectQty(idx, 'batchQty', Number(e.target.value) || 0)} min={0} />
                        </div>
                        <div>
                          <Label className="text-xs">Reserved</Label>
                          <Input type="number" value={pq.reservedQty || ''} onChange={(e) => updateProjectQty(idx, 'reservedQty', Number(e.target.value) || 0)} min={0} />
                        </div>
                        <div>
                          <Label className="text-xs">Consumed</Label>
                          <Input type="number" value={pq.consumedQty || ''} onChange={(e) => updateProjectQty(idx, 'consumedQty', Number(e.target.value) || 0)} min={0} />
                        </div>
                        <div>
                          <Label className="text-xs">Ordered</Label>
                          <Input type="number" value={pq.orderedQty || ''} onChange={(e) => updateProjectQty(idx, 'orderedQty', Number(e.target.value) || 0)} min={0} />
                        </div>
                        <div>
                          <Label className="text-xs">To Be Used</Label>
                          <Input type="number" value={pq.toBeUsed || ''} onChange={(e) => updateProjectQty(idx, 'toBeUsed', Number(e.target.value) || 0)} min={0} />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Remarks</Label>
                          <Input value={pq.remarks} onChange={(e) => updateProjectQty(idx, 'remarks', e.target.value)} placeholder="Project-specific notes" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* ─── 4. Additional ──────────────────────────────────────────── */}
          <Collapsible open={sectionsOpen.additional} onOpenChange={() => toggleSection('additional')}>
            <SectionHeader sectionKey="additional" title="Additional" subtitle="Purchase reference, dates, remarks" />
            <CollapsibleContent className="space-y-4 pt-3 px-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Purchase Reference</Label>
                  <Input value={purchaseRef} onChange={(e) => setPurchaseRef(e.target.value)} placeholder="e.g., PO-2024-001" />
                </div>
                <div>
                  <Label className="text-xs">Invoice Number</Label>
                  <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g., INV-001" />
                </div>
                <div>
                  <Label className="text-xs">Opening Date</Label>
                  <Input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Received Date</Label>
                  <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Remarks</Label>
                <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any remarks about this entry..." rows={2} />
              </div>
              <div>
                <Label className="text-xs">Internal Notes</Label>
                <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Internal notes (not shown to everyone)..." rows={2} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* ─── Footer ───────────────────────────────────────────────────── */}
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || (isEdit ? false : (!selectedProduct || openingQty <= 0))}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Update' : 'Create Opening Stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
