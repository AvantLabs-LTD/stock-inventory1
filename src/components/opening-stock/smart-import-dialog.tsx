'use client'

import { useCallback, useRef, useState } from 'react'
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  ArrowLeft,
  ArrowRight,
  FileUp,
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
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
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

interface AnalysisResult {
  fileName: string
  fileSize: number
  sheetNames: Array<{ name: string; rowCount: number }>
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  columnMapping: {
    standard: Record<string, number>
    extra: Record<string, number>
  }
  projectFieldCandidates: string[]
  previewRows: Record<string, string | number | null>[]
  warnings: string[]
}

interface ImportResult {
  success: boolean
  importBatchId: string
  message: string
  imported: number
  updated: number
  skipped: number
  errorCount: number
  warningCount: number
  errors: string[]
  warnings: string[]
  durationMs: number
}

interface SmartImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

type Step = 1 | 2 | 3

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function getTransactionTypeColor(type: string): string {
  switch (type) {
    case 'OPENING':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    case 'GOODS_RECEIVED':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
    case 'ISSUED':
      return 'bg-red-500/10 text-red-700 dark:text-red-400'
    case 'RETURNED':
      return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
    case 'TRANSFER_IN':
      return 'bg-violet-500/10 text-violet-700 dark:text-violet-400'
    case 'TRANSFER_OUT':
      return 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400'
    case 'ADJUSTMENT_IN':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
    case 'ADJUSTMENT_OUT':
      return 'bg-orange-500/10 text-orange-700 dark:text-orange-400'
    case 'DAMAGED':
      return 'bg-gray-500/10 text-gray-700 dark:text-gray-400'
    case 'SCRAPPED':
      return 'bg-red-500/10 text-red-700 dark:text-red-400'
    case 'RESERVED':
      return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
    case 'RELEASED':
      return 'bg-lime-500/10 text-lime-700 dark:text-lime-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

const COLUMN_LABELS: Record<string, string> = {
  name: 'Item Name',
  specification: 'Specification',
  category: 'Category',
  unit: 'Unit',
  quantity: 'Quantity',
  batchNumber: 'Batch Number',
  serialNumber: 'Serial Number',
  remarks: 'Remarks',
  warehouse: 'Warehouse',
  supplier: 'Supplier',
  unitCost: 'Unit Cost',
  expiryDate: 'Expiry Date',
  storageLocation: 'Storage Location',
  invoiceNumber: 'Invoice Number',
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SmartImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: SmartImportDialogProps) {
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importProgress, setImportProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setStep(1)
    setFile(null)
    setDragOver(false)
    setAnalyzing(false)
    setImporting(false)
    setAnalysis(null)
    setImportResult(null)
    setImportProgress(0)
  }, [])

  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      resetState()
    }
    onOpenChange(open)
  }, [onOpenChange, resetState])

  // ─── Step 1: File Upload & Analyze ─────────────────────────────────────
  const handleFileSelect = useCallback((selectedFile: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv']
    const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase()
    if (!validExtensions.includes(ext)) {
      toast.error('Invalid file type. Please upload .xlsx, .xls, or .csv files.')
      return
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 50 MB.')
      return
    }
    setFile(selectedFile)
    analyzeFile(selectedFile)
  }, [])

  const analyzeFile = useCallback(async (selectedFile: File) => {
    setAnalyzing(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetch('/api/opening-stock/import/analyze', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Analysis failed')
      }

      const result = await res.json()
      setAnalysis(result)
      setStep(2)
      toast.success(`Analysis complete: ${result.validRows} valid rows found`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to analyze file')
      setFile(null)
    } finally {
      setAnalyzing(false)
    }
  }, [])

  // ─── Step 2: Execute Import ────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!file || !analysis) return
    setImporting(true)
    setImportProgress(10)

    try {
      // Read file as base64 for the execute endpoint
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1]
          setImportProgress(30)

          const body = {
            fileData: base64Data,
            fileName: file.name,
            columnMapping: analysis.columnMapping,
            sheetName: analysis.sheetNames[0]?.name || null,
            projectFields: analysis.projectFieldCandidates.map((name) => ({ name })),
          }

          setImportProgress(50)

          const res = await fetch('/api/opening-stock/import/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

          setImportProgress(80)

          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || 'Import failed')
          }

          const result = await res.json()
          setImportResult(result)
          setImportProgress(100)
          setStep(3)

          if (result.errorCount > 0) {
            toast.warning(`Import completed with ${result.errorCount} errors`)
          } else {
            toast.success(result.message)
          }
          onImportComplete()
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Import failed')
          setImportProgress(0)
        } finally {
          setImporting(false)
        }
      }
      reader.onerror = () => {
        toast.error('Failed to read file')
        setImporting(false)
        setImportProgress(0)
      }
      reader.readAsDataURL(file)
    } catch {
      setImporting(false)
      setImportProgress(0)
    }
  }, [file, analysis, onImportComplete])

  // ─── Drag & Drop Handlers ─────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  // ─── Render Step 1: Upload ────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="space-y-4">
      <div
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {analyzing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium">Analyzing file...</p>
            <p className="text-xs text-muted-foreground">Reading columns and data</p>
          </div>
        ) : file ? (
          <div className="flex flex-col items-center gap-3">
            <FileSpreadsheet className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Analyzing...</p>
          </div>
        ) : (
          <>
            <Upload className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Drag & drop your file here</p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports .xlsx, .xls, .csv (max 50 MB)
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="mr-2 h-4 w-4" />
              Browse Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0]
                if (selected) handleFileSelect(selected)
              }}
            />
          </>
        )}
      </div>
    </div>
  )

  // ─── Render Step 2: Review / Preview ──────────────────────────────────
  const renderStep2 = () => {
    if (!analysis) return null
    const standardCols = Object.entries(analysis.columnMapping.standard)
    const extraCols = Object.entries(analysis.columnMapping.extra)

    return (
      <div className="space-y-4">
        {/* File Info */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground">File</p>
            <p className="text-sm font-medium truncate">{analysis.fileName}</p>
          </div>
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Rows</p>
            <p className="text-lg font-bold">{analysis.totalRows}</p>
          </div>
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground">Valid Rows</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{analysis.validRows}</p>
          </div>
        </div>

        {/* Status Summary */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            {analysis.validRows} Valid
          </Badge>
          {analysis.invalidRows > 0 && (
            <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400">
              <XCircle className="mr-1 h-3 w-3" />
              {analysis.invalidRows} Invalid
            </Badge>
          )}
          {analysis.duplicateRows > 0 && (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {analysis.duplicateRows} Duplicates
            </Badge>
          )}
          <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400">
            <FileText className="mr-1 h-3 w-3" />
            {standardCols.length} Columns Matched
          </Badge>
          {extraCols.length > 0 && (
            <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400">
              <FileText className="mr-1 h-3 w-3" />
              {extraCols.length} Extra Columns
            </Badge>
          )}
        </div>

        {/* Warnings */}
        {analysis.warnings.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Warnings</p>
            <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
              {analysis.warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Column Mapping */}
        <div>
          <p className="text-xs font-semibold mb-2">Detected Columns</p>
          <div className="flex flex-wrap gap-1.5">
            {standardCols.map(([field, colIdx]) => (
              <Badge key={field} variant="secondary" className="text-xs">
                {COLUMN_LABELS[field] || field} (Col {colIdx})
              </Badge>
            ))}
            {extraCols.map(([name, colIdx]) => (
              <Badge key={name} variant="outline" className="text-xs border-violet-500/30">
                {name} (Col {colIdx})
              </Badge>
            ))}
          </div>
        </div>

        {/* Project Field Candidates */}
        {analysis.projectFieldCandidates.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2">Project Columns Detected</p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.projectFieldCandidates.map((name) => (
                <Badge key={name} variant="outline" className="text-xs border-primary/30">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Preview Table */}
        {analysis.previewRows.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2">Preview (first {analysis.previewRows.length} rows)</p>
            <ScrollArea className="rounded-md border max-h-48">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(analysis.previewRows[0]).map((key) => (
                      <TableHead key={key} className="text-xs whitespace-nowrap">
                        {COLUMN_LABELS[key] || key}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.previewRows.map((row, i) => (
                    <TableRow key={i}>
                      {Object.values(row).map((val, j) => (
                        <TableCell key={j} className="text-xs py-1.5 whitespace-nowrap">
                          {val !== null && val !== undefined ? String(val) : ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {/* Sheets Info */}
        {analysis.sheetNames.length > 1 && (
          <p className="text-xs text-muted-foreground">
            Note: File has {analysis.sheetNames.length} sheets. Importing from &ldquo;{analysis.sheetNames[0].name}&rdquo;
          </p>
        )}
      </div>
    )
  }

  // ─── Render Step 3: Results ───────────────────────────────────────────
  const renderStep3 = () => {
    if (!importResult) return null

    return (
      <div className="space-y-4">
        {/* Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span>Import Progress</span>
            <span className="font-medium">{importResult.success ? 'Complete' : 'Failed'}</span>
          </div>
          <Progress value={100} className="h-2" />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground">Imported</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{importResult.imported}</p>
          </div>
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground">Updated</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{importResult.updated}</p>
          </div>
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground">Skipped</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{importResult.skipped}</p>
          </div>
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="text-lg font-bold">{(importResult.durationMs / 1000).toFixed(1)}s</p>
          </div>
        </div>

        {/* Errors */}
        {importResult.errors.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">
              Errors ({importResult.errorCount})
            </p>
            <ScrollArea className="rounded-md border border-red-500/30 max-h-32">
              <div className="p-2 space-y-1">
                {importResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">
                    • {err}
                  </p>
                ))}
                {importResult.errorCount > importResult.errors.length && (
                  <p className="text-xs text-muted-foreground italic">
                    ...and {importResult.errorCount - importResult.errors.length} more
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Warnings */}
        {importResult.warnings.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2">
              Warnings ({importResult.warningCount})
            </p>
            <ScrollArea className="rounded-md border border-amber-500/30 max-h-32">
              <div className="p-2 space-y-1">
                {importResult.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
                    • {w}
                  </p>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    )
  }

  // ─── Main Render ──────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Smart Excel Import
          </DialogTitle>
          <DialogDescription>
            Import opening stock data from Excel or CSV files
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : step > s
                    ? 'bg-emerald-500 text-white'
                    : 'bg-muted text-muted-foreground'
              }`}>
                {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              <span className={`text-xs ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>
                {s === 1 ? 'Upload' : s === 2 ? 'Review' : 'Result'}
              </span>
              {s < 3 && <div className="h-px w-8 bg-muted-foreground/20" />}
            </div>
          ))}
        </div>

        <Separator />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t pt-4">
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button
              onClick={() => {
                if (step === 1) {
                  if (!file) {
                    toast.error('Please upload a file first')
                    return
                  }
                }
                if (step === 2) {
                  handleImport()
                  return
                }
              }}
              disabled={
                (step === 1 && (!file || analyzing)) ||
                (step === 2 && importing) ||
                (step === 1 && !!analysis) // already analyzed, will auto-advance
              }
            >
              {step === 1 && analyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {step === 2 && importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {step === 1 ? 'Analyze' : 'Import Data'}
              {step === 2 && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          ) : (
            <Button onClick={() => handleClose(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
