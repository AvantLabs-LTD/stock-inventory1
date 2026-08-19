'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Info,
  Package,
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
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { isUploadTooLarge, MAX_UPLOAD_LABEL } from '@/lib/upload-limits'

// ─── Column Aliases (mirrors server-side) ────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  itemName: ['item name', 'item_name', 'item', 'name', 'product name', 'product_name', 'product', 'material', 'part name', 'part'],
  specification: ['specification', 'spec', 'size', 'model', 'type', 'variant', 'description', 'detail'],
  unit: ['unit', 'uom', 'measurement'],
  quantity: ['quantity', 'qty', 'stock', 'inventory', 'opening stock', 'opening_stock', 'current stock', 'on hand', 'available'],
  minimumStock: ['min stock', 'min_stock', 'minimum stock', 'minimum_stock', 'reorder level', 'reorder', 'alert level'],
  unitCost: ['unit cost', 'unit_cost', 'cost', 'price', 'rate', 'unit price'],
  warehouse: ['warehouse', 'location', 'store', 'godown', 'wh'],
  category: ['category', 'category name', 'group', 'classification'],
  remarks: ['remarks', 'notes', 'comment', 'comments'],
}

const FIELD_LABELS: Record<string, string> = {
  itemName: 'Item Name',
  specification: 'Specification',
  unit: 'Unit',
  quantity: 'Quantity',
  minimumStock: 'Min Stock',
  unitCost: 'Unit Cost',
  warehouse: 'Warehouse',
  category: 'Category',
  remarks: 'Remarks',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreviewRow {
  itemName: string
  specification: string
  unit: string
  quantity: number
  minimumStock: number
  unitCost: number
  warehouse: string
  category: string
  remarks: string
  rowNum: number
  warning?: string
}

interface GroupedPreview {
  itemName: string
  specs: PreviewRow[]
  totalQty: number
}

interface ImportResult {
  imported: number
  skipped: number
  productsCreated: number
  categoriesCreated: number
  warnings: { row: number; message: string }[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapColumns(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {}
  headers.forEach((header, colIdx) => {
    const h = String(header || '').trim().toLowerCase()
    if (!h) return
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (mapping[field] !== undefined) continue
      const sorted = [...aliases].sort((a, b) => b.length - a.length)
      for (const alias of sorted) {
        if (h === alias || h === alias.replace(/\s+/g, '_')) {
          mapping[field] = colIdx
          break
        }
      }
    }
  })
  return mapping
}

function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const cleaned = String(val).replace(/[,\s]/g, '')
  const n = Number(cleaned)
  return isNaN(n) ? 0 : n
}

function getCellStr(row: unknown[], idx: number | undefined): string {
  if (idx === undefined || idx === null) return ''
  const val = row[idx]
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

function fmt(n: number) {
  return n.toLocaleString()
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportExcelDialog({ open, onOpenChange, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [preview, setPreview] = useState<GroupedPreview[] | null>(null)
  const [colMapping, setColMapping] = useState<Record<string, number>>({})
  const [excelHeaders, setExcelHeaders] = useState<string[]>([])
  const [skippedRows, setSkippedRows] = useState<{ row: number; message: string }[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  // ── reset ─────────────────────────────────────────────────────────────────
  function reset() {
    setFile(null)
    setPreview(null)
    setColMapping({})
    setExcelHeaders([])
    setSkippedRows([])
    setTotalRows(0)
    setExpanded(new Set())
    setImporting(false)
    setResult(null)
    setDragOver(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    reset()
    onOpenChange(false)
  }

  // ── file parsing ──────────────────────────────────────────────────────────
  async function parseFile(f: File) {
    setParsing(true)
    setPreview(null)
    setResult(null)
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]

      if (!rows || rows.length < 2) {
        toast.error('File has no data rows — needs at least a header row and one data row')
        return
      }

      const headerRow = (rows[0] as string[]).map(String)
      setExcelHeaders(headerRow)
      const colMap = mapColumns(headerRow)
      setColMapping(colMap)

      const dataRows = rows.slice(1)
      setTotalRows(dataRows.length)

      const skipped: { row: number; message: string }[] = []
      const groupMap = new Map<string, PreviewRow[]>()

      dataRows.forEach((row, idx) => {
        const rowNum = idx + 2
        const isEmpty = (row as unknown[]).every((c) => c === '' || c === null || c === undefined)
        if (isEmpty) return

        const itemName = getCellStr(row as unknown[], colMap.itemName)
        if (!itemName) {
          skipped.push({ row: rowNum, message: `Row ${rowNum}: No "Item Name" found — skipped` })
          return
        }

        const specification = getCellStr(row as unknown[], colMap.specification) || '—'
        const unit = getCellStr(row as unknown[], colMap.unit) || 'pcs'
        const quantity = parseNum(getCellStr(row as unknown[], colMap.quantity))
        const minimumStock = parseNum(getCellStr(row as unknown[], colMap.minimumStock))
        const unitCost = parseNum(getCellStr(row as unknown[], colMap.unitCost))
        const warehouse = getCellStr(row as unknown[], colMap.warehouse) || 'Main Warehouse'
        const category = getCellStr(row as unknown[], colMap.category)
        const remarks = getCellStr(row as unknown[], colMap.remarks)

        const previewRow: PreviewRow = {
          rowNum, itemName, specification, unit,
          quantity, minimumStock, unitCost,
          warehouse, category, remarks,
        }

        const existing = groupMap.get(itemName)
        if (existing) {
          existing.push(previewRow)
        } else {
          groupMap.set(itemName, [previewRow])
        }
      })

      setSkippedRows(skipped)

      const groups: GroupedPreview[] = Array.from(groupMap.entries())
        .map(([itemName, specs]) => ({
          itemName,
          specs,
          totalQty: specs.reduce((s, r) => s + r.quantity, 0),
        }))
        .sort((a, b) => a.itemName.localeCompare(b.itemName))

      setPreview(groups)

      // Auto-expand first 3 groups
      setExpanded(new Set(groups.slice(0, 3).map((g) => g.itemName)))
    } catch (e) {
      console.error(e)
      toast.error('Failed to parse file — make sure it is a valid Excel file')
    } finally {
      setParsing(false)
    }
  }

  function handleFileSelect(f: File | undefined) {
    if (!f) return
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      toast.error('Only .xlsx, .xls, or .csv files are supported')
      return
    }
    if (f.size === 0) { toast.error('File is empty'); return }
    if (isUploadTooLarge(f)) { toast.error(`File too large (max ${MAX_UPLOAD_LABEL})`); return }
    setFile(f)
    parseFile(f)
  }

  // ── drag-drop ─────────────────────────────────────────────────────────────
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFileSelect(e.dataTransfer.files[0])
  }

  // ── accordion ─────────────────────────────────────────────────────────────
  function toggleGroup(name: string) {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })
  }

  // ── import ────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (!file) return
    setImporting(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/inventory-items/import', { method: 'POST', body: form })
      const json = await res.json()
      if (res.ok) {
        setResult(json)
        onSuccess()
        toast.success(`✅ Imported ${json.imported} items${json.skipped ? `, ${json.skipped} skipped` : ''}`)
      } else {
        toast.error(json.error || 'Import failed')
      }
    } catch {
      toast.error('Network error during import')
    } finally {
      setImporting(false)
    }
  }

  // ─── Mapped / unmapped column status ─────────────────────────────────────
  const mappedFields = Object.keys(colMapping)
  const unmappedRequired = ['itemName'].filter((f) => !mappedFields.includes(f))
  const hasRequiredFields = unmappedRequired.length === 0
  const totalPreviewItems = preview?.reduce((s, g) => s + g.specs.length, 0) ?? 0

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Import Inventory from Excel
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx / .xls / .csv). Preview your data before importing.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="px-6 py-4 space-y-4">

            {/* ── Upload Zone ─────────────────────────────────────────── */}
            {!file && (
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
                  dragOver
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10 scale-[1.01]'
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30'
                }`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-semibold text-sm">Drop your Excel file here, or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv — max 50 MB</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleFileSelect(e.target.files?.[0])} />
              </div>
            )}

            {/* ── File Selected Banner ─────────────────────────────────── */}
            {file && !result && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                {!importing && (
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={reset}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            {/* ── Parsing spinner ──────────────────────────────────────── */}
            {parsing && (
              <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">Reading your file…</span>
              </div>
            )}

            {/* ── Column Mapping Panel ─────────────────────────────────── */}
            {!parsing && preview && (
              <div className="rounded-lg border overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/40 border-b flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Column Mapping Detected</span>
                  <span className="text-xs text-muted-foreground">{excelHeaders.length} columns in file</span>
                </div>
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {Object.entries(FIELD_LABELS).map(([field, label]) => {
                    const colIdx = colMapping[field]
                    const colName = colIdx !== undefined ? excelHeaders[colIdx] : null
                    const isRequired = field === 'itemName'
                    const isMapped = colIdx !== undefined
                    return (
                      <div
                        key={field}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs border ${
                          isMapped
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/10 dark:border-emerald-800 dark:text-emerald-300'
                            : isRequired
                            ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/10 dark:border-red-800'
                            : 'bg-muted/30 border-border text-muted-foreground'
                        }`}
                      >
                        {isMapped ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="font-medium">{label}</span>
                        {colName && (
                          <span className="ml-auto text-[10px] opacity-70 truncate max-w-[80px]">← {colName}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {!hasRequiredFields && (
                  <div className="mx-3 mb-3 p-2.5 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-md flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      <strong>"Item Name"</strong> column not found. Make sure Row 1 has a header like{' '}
                      <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">Item Name</code>,{' '}
                      <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">Product</code>, or{' '}
                      <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">Part Name</code>.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Preview Stats Bar ─────────────────────────────────────── */}
            {!parsing && preview && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Item Groups', value: preview.length, color: 'text-slate-700', bg: 'bg-slate-50' },
                  { label: 'Specifications', value: totalPreviewItems, color: 'text-violet-700', bg: 'bg-violet-50' },
                  { label: 'Skipped Rows', value: skippedRows.length, color: 'text-amber-700', bg: 'bg-amber-50' },
                  { label: 'Total Rows Read', value: totalRows, color: 'text-blue-700', bg: 'bg-blue-50' },
                ].map((s) => (
                  <div key={s.label} className={`${s.bg} rounded-lg px-3 py-2.5 border`}>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{s.label}</p>
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Skipped Row Warnings ─────────────────────────────────── */}
            {!parsing && skippedRows.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {skippedRows.length} row(s) will be skipped (no Item Name found)
                </div>
                <ul className="space-y-0.5 max-h-24 overflow-auto">
                  {skippedRows.slice(0, 10).map((w) => (
                    <li key={w.row} className="text-xs text-amber-700 dark:text-amber-400 font-mono">
                      {w.message}
                    </li>
                  ))}
                  {skippedRows.length > 10 && (
                    <li className="text-xs text-amber-600">…and {skippedRows.length - 10} more</li>
                  )}
                </ul>
              </div>
            )}

            {/* ── Preview Table ────────────────────────────────────────── */}
            {!parsing && preview && preview.length > 0 && hasRequiredFields && (
              <div className="rounded-lg border overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/40 border-b flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Preview — {preview.length} Item Groups
                  </span>
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setExpanded(new Set(preview.map((g) => g.itemName)))}>
                      Expand All
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setExpanded(new Set())}>
                      Collapse All
                    </Button>
                  </div>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[auto_1fr_80px_70px_80px_80px_100px] gap-0 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/20 border-b px-3 py-2">
                  <div className="w-6" />
                  <div>Item / Specification</div>
                  <div className="text-right">Qty</div>
                  <div className="text-right">Min</div>
                  <div className="text-right">Cost</div>
                  <div>Unit</div>
                  <div>Warehouse</div>
                </div>

                <div className="divide-y max-h-[400px] overflow-auto">
                  {preview.map((group) => {
                    const isOpen = expanded.has(group.itemName)
                    return (
                      <div key={group.itemName}>
                        {/* Parent row */}
                        <div
                          className="grid grid-cols-[auto_1fr_80px_70px_80px_80px_100px] gap-0 items-center px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleGroup(group.itemName)}
                        >
                          <div className="w-6">
                            {isOpen
                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-sm truncate">{group.itemName}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal shrink-0">
                              {group.specs.length} spec{group.specs.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          <div className="text-right text-sm font-mono font-semibold text-emerald-700">{fmt(group.totalQty)}</div>
                          <div className="text-right text-xs text-muted-foreground">—</div>
                          <div className="text-right text-xs text-muted-foreground">—</div>
                          <div className="text-xs text-muted-foreground">—</div>
                          <div className="text-xs text-muted-foreground">—</div>
                        </div>

                        {/* Spec rows */}
                        {isOpen && group.specs.map((spec) => (
                          <div
                            key={spec.rowNum}
                            className="grid grid-cols-[auto_1fr_80px_70px_80px_80px_100px] gap-0 items-center px-3 py-2 bg-slate-50/60 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-700"
                          >
                            <div className="w-6" />
                            <div className="flex items-center gap-2 pl-4 min-w-0">
                              <span className="text-muted-foreground text-xs">↳</span>
                              <div className="min-w-0">
                                <p className="text-sm truncate">{spec.specification}</p>
                                <p className="text-[10px] text-muted-foreground">row {spec.rowNum}{spec.category ? ` · ${spec.category}` : ''}</p>
                              </div>
                            </div>
                            <div className="text-right text-sm font-mono">
                              <span className={spec.quantity === 0 ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}>{fmt(spec.quantity)}</span>
                            </div>
                            <div className="text-right text-xs text-muted-foreground font-mono">{spec.minimumStock || '—'}</div>
                            <div className="text-right text-xs text-muted-foreground font-mono">{spec.unitCost ? fmt(spec.unitCost) : '—'}</div>
                            <div className="text-xs text-muted-foreground">{spec.unit}</div>
                            <div className="text-xs text-muted-foreground truncate">{spec.warehouse}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Empty preview ────────────────────────────────────────── */}
            {!parsing && preview && preview.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <AlertTriangle className="h-10 w-10 mx-auto mb-2 text-amber-400" />
                <p className="font-medium">No valid rows found in this file</p>
                <p className="text-sm mt-1">Make sure Row 1 has headers and data starts from Row 2.</p>
              </div>
            )}

            {/* ── Success Result ───────────────────────────────────────── */}
            {result && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-800 dark:text-emerald-300">Import Completed Successfully!</p>
                    <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                      Your inventory data has been saved to the database.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Items Imported', value: result.imported, color: 'text-emerald-700' },
                    { label: 'Items Skipped', value: result.skipped, color: 'text-amber-700' },
                    { label: 'Products Created', value: result.productsCreated, color: 'text-blue-700' },
                    { label: 'Categories Created', value: result.categoriesCreated, color: 'text-violet-700' },
                  ].map((s) => (
                    <div key={s.label} className="bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {result.warnings?.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
                      <AlertTriangle className="inline h-3 w-3 mr-1" />
                      {result.warnings.length} warning(s)
                    </p>
                    <ul className="space-y-0.5 max-h-20 overflow-auto">
                      {result.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-amber-700 dark:text-amber-400 font-mono">{w.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* ── Format Guide ─────────────────────────────────────────── */}
            {!file && (
              <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 p-4 space-y-2">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-xs font-semibold">
                  <Info className="h-3.5 w-3.5" />
                  Expected Column Headers (Row 1)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { col: 'A', name: 'Item Name', req: true },
                    { col: 'B', name: 'Specification', req: false },
                    { col: 'C', name: 'Unit', req: false },
                    { col: 'D', name: 'Quantity', req: false },
                    { col: 'E', name: 'Min Stock', req: false },
                    { col: 'F', name: 'Unit Cost', req: false },
                    { col: 'G', name: 'Warehouse', req: false },
                    { col: 'H', name: 'Category', req: false },
                  ].map((c) => (
                    <div key={c.col} className="flex items-center gap-1.5 text-xs">
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 w-4">{c.col}</span>
                      <span className="text-slate-600 dark:text-slate-300">{c.name}</span>
                      {c.req && <Badge className="text-[9px] px-1 py-0 h-3.5 bg-red-100 text-red-600 border-none">required</Badge>}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  Column names are flexible — <em>Part Name, Product, Material</em> all map to "Item Name". Same for Spec, Qty, Cost, etc.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/20 shrink-0 flex justify-between items-center">
          <div className="text-xs text-muted-foreground">
            {preview && !result && hasRequiredFields && (
              <span>{totalPreviewItems} specification row(s) ready to import across {preview.length} item group(s)</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={importing}>
              {result ? 'Close' : 'Cancel'}
            </Button>
            {result ? (
              <Button onClick={() => { reset() }} variant="secondary">
                Import Another File
              </Button>
            ) : (
              preview && hasRequiredFields && preview.length > 0 && (
                <Button onClick={handleImport} disabled={importing} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                  {importing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                  ) : (
                    <><Upload className="h-4 w-4" /> Import {totalPreviewItems} Items</>
                  )}
                </Button>
              )
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
