'use client'

import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, X, Loader2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface BomUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string | null
  projectName: string
  onSuccess: () => void
}

interface BomData {
  projectId: string
  fileName: string
  sheetName: string
  columns: string[]
  rowCount: number
  rows: Record<string, unknown>[]
}

export function BomUploadDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onSuccess,
}: BomUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [bomData, setBomData] = useState<BomData | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setBomData(null)
  }

  function handleRemoveFile() {
    setFile(null)
    setBomData(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleUpload() {
    if (!file || !projectId) return

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectId', projectId)

      const res = await fetch('/api/projects/bom', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      const result = await res.json()
      setBomData(result.data)
      toast.success('BOM uploaded successfully')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload BOM')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setFile(null)
    setBomData(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) handleClose()
        else onOpenChange(value)
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Upload BOM</DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx, .xls) containing the Bill of Materials
            for <span className="font-medium text-foreground">{projectName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {!bomData && (
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const dropped = e.dataTransfer.files?.[0] ?? null
                if (dropped && (dropped.name.endsWith('.xlsx') || dropped.name.endsWith('.xls'))) {
                  setFile(dropped)
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                {file ? (
                  <span className="text-foreground font-medium">{file.name}</span>
                ) : (
                  <>
                    Click or drag and drop to upload
                    <br />
                    <span className="text-xs">.xlsx, .xls files only</span>
                  </>
                )}
              </p>
            </div>
          )}

          {file && !bomData && (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="text-sm font-medium truncate">{file.name}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveFile()
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {bomData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">{bomData.fileName}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Sheet: {bomData.sheetName}</Badge>
                <Badge variant="secondary">{bomData.columns.length} Columns</Badge>
                <Badge variant="secondary">{bomData.rowCount} Rows</Badge>
              </div>

              <div className="max-h-[400px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      {bomData.columns.map((col) => (
                        <TableHead key={col}>{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bomData.rows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-center text-muted-foreground text-xs">
                          {idx + 1}
                        </TableCell>
                        {bomData.columns.map((col) => (
                          <TableCell key={col} className="whitespace-nowrap">
                            {String(row[col] ?? '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Close</Button>
          {!bomData && (
            <Button disabled={!file || loading} onClick={handleUpload}>
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              <Upload className="mr-2 size-4" />
              Upload
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
