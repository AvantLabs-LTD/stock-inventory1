'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Package, Building2, FolderKanban, User, Hash, MessageSquare } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Badge } from '@/components/ui/badge'

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
  status: string
}

const returnSchema = z.object({
  departmentId: z.string().min(1, 'Please select a department'),
  projectId: z.string().min(1, 'Please select a project'),
  productId: z.string().min(1, 'Please select a product'),
  employeeName: z.string().min(1, 'Please enter employee name').max(100),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  remarks: z.string().max(500).optional(),
})

type ReturnFormValues = z.infer<typeof returnSchema>

interface ReturnFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ReturnFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: ReturnFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [projectSearch, setProjectSearch] = useState('')

  const form = useForm<ReturnFormValues>({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      departmentId: '',
      projectId: '',
      productId: '',
      employeeName: '',
      quantity: 1,
      remarks: '',
    },
    mode: 'onChange',
  })

  const watchedDepartmentId = form.watch('departmentId')
  const watchedProductId = form.watch('productId')

  // Load data when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        departmentId: '',
        projectId: '',
        productId: '',
        employeeName: '',
        quantity: 1,
        remarks: '',
      })
      setProductSearch('')
      setProjectSearch('')

      fetch('/api/departments?limit=200&status=ACTIVE')
        .then((r) => r.json())
        .then((d) => setDepartments(d.data || []))
        .catch(() => {})

      fetch('/api/products?limit=200&status=ACTIVE')
        .then((r) => r.json())
        .then((d) => setProducts(d.data || []))
        .catch(() => {})
    }
  }, [open, form])

  // Filter projects when department changes
  useEffect(() => {
    if (!watchedDepartmentId) {
      setProjects([])
      return
    }
    fetch(`/api/projects?limit=200&departmentId=${watchedDepartmentId}`)
      .then((r) => r.json())
      .then((d) => setProjects(d.data || []))
      .catch(() => {})
    form.setValue('projectId', '')
  }, [watchedDepartmentId, form])

  async function onSubmit(values: ReturnFormValues) {
    setLoading(true)
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (res.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        form.setError('root', { message: data.error || 'Failed to record return' })
      }
    } catch {
      form.setError('root', { message: 'Network error. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase())
  )

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(projectSearch.toLowerCase())
  )

  const selectedProduct = products.find((p) => p.id === watchedProductId)
  const selectedDepartment = departments.find((d) => d.id === watchedDepartmentId)
  const selectedProject = projects.find((p) => p.id === form.getValues('projectId'))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Return</DialogTitle>
          <DialogDescription>
            Record inventory returned from a department and project.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {form.formState.errors.root && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="departmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-60">
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{d.code}</span>
                              <span>{d.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={watchedDepartmentId ? 'Select project' : 'Select dept first'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-60">
                        <div className="p-2 border-b">
                          <Input
                            placeholder="Search projects..."
                            value={projectSearch}
                            onChange={(e) => setProjectSearch(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        {filteredProjects.length === 0 ? (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            No projects found
                          </div>
                        ) : (
                          filteredProjects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                                <span>{p.name}</span>
                              </span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Search and select product" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-60">
                      <div className="p-2 border-b">
                        <Input
                          placeholder="Search by name, code, or SKU..."
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      {filteredProducts.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No products found
                        </div>
                      ) : (
                        filteredProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                              <span>{p.name}</span>
                              <Badge variant="secondary" className="text-[10px] ml-auto">{p.unit}</Badge>
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="employeeName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Name of employee returning items" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity * ({selectedProduct?.unit || 'units'})</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes about this return..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Summary */}
            {(selectedDepartment || selectedProject || selectedProduct) && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <h4 className="font-medium mb-2">Return Summary</h4>
                <div className="grid grid-cols-2 gap-2">
                  {selectedDepartment && (
                    <div>
                      <p className="text-xs text-muted-foreground">Department</p>
                      <p className="text-sm">{selectedDepartment.name}</p>
                    </div>
                  )}
                  {selectedProject && (
                    <div>
                      <p className="text-xs text-muted-foreground">Project</p>
                      <p className="text-sm">{selectedProject.name}</p>
                    </div>
                  )}
                  {selectedProduct && (
                    <div>
                      <p className="text-xs text-muted-foreground">Product</p>
                      <p className="text-sm">{selectedProduct.name}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className="text-sm font-medium text-primary">
                      {form.getValues('quantity') || 0} {selectedProduct?.unit || 'units'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Record Return
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
