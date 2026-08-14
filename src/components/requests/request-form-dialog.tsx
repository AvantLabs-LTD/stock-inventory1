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

interface Department {
  id: string
  name: string
  code: string
  status: string
}

interface Project {
  id: string
  name: string
  code: string
  departmentId: string
  status: string
}

interface Product {
  id: string
  name: string
  code: string
  sku: string
  unit: string
  status: string
}

const requestSchema = z.object({
  productId: z.string().min(1, 'Please select a product'),
  departmentId: z.string().min(1, 'Please select a department'),
  projectId: z.string().min(1, 'Please select a project'),
  employeeName: z.string().min(1, 'Please enter employee name').max(100),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  priority: z.string().min(1, 'Please select a priority'),
  reason: z.string().max(500).optional(),
})

type RequestFormValues = z.infer<typeof requestSchema>

interface RequestFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function RequestFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: RequestFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')

  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      productId: '',
      departmentId: '',
      projectId: '',
      employeeName: '',
      quantity: 1,
      priority: 'MEDIUM',
      reason: '',
    },
    mode: 'onChange',
  })

  const watchedDepartmentId = form.watch('departmentId')

  // Load departments and products when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        productId: '',
        departmentId: '',
        projectId: '',
        employeeName: '',
        quantity: 1,
        priority: 'MEDIUM',
        reason: '',
      })
      setProductSearch('')

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
    fetch(`/api/projects?limit=200&departmentId=${watchedDepartmentId}&status=ACTIVE`)
      .then((r) => r.json())
      .then((d) => setProjects(d.data || []))
      .catch(() => {})
    form.setValue('projectId', '')
  }, [watchedDepartmentId, form])

  async function onSubmit(values: RequestFormValues) {
    setLoading(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (res.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        form.setError('root', { message: data.error || 'Failed to submit request' })
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

  const selectedProduct = products.find((p) => p.id === form.getValues('productId'))
  const watchedQuantity = form.watch('quantity')
  const watchedPriority = form.watch('priority')

  const priorityLabels: Record<string, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'Urgent',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Inventory Request</DialogTitle>
          <DialogDescription>
            Submit a request for inventory items. Your request will need to be approved by an administrator.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {form.formState.errors.root && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            {/* Product */}
            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Package className="size-3.5 text-muted-foreground" />
                    Product *
                  </FormLabel>
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

            {/* Department */}
            <FormField
              control={form.control}
              name="departmentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Building2 className="size-3.5 text-muted-foreground" />
                    Department *
                  </FormLabel>
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

            {/* Project */}
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <FolderKanban className="size-3.5 text-muted-foreground" />
                    Project *
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={watchedDepartmentId ? 'Select project' : 'Select a department first'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-60">
                      {projects.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          {watchedDepartmentId ? 'No projects found for this department' : 'Select a department first'}
                        </div>
                      ) : (
                        projects.map((p) => (
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

            {/* Employee Name */}
            <FormField
              control={form.control}
              name="employeeName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <User className="size-3.5 text-muted-foreground" />
                    Employee Name *
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Enter the name of the requesting employee" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Quantity & Priority */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Hash className="size-3.5 text-muted-foreground" />
                      Quantity *
                    </FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                    {selectedProduct && (
                      <p className="text-xs text-muted-foreground">
                        Unit: {selectedProduct.unit}
                      </p>
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                          <SelectItem key={p} value={p}>
                            {priorityLabels[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Reason */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <MessageSquare className="size-3.5 text-muted-foreground" />
                    Reason
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Why do you need these items?"
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Summary preview */}
            {form.getValues('productId') && watchedQuantity > 0 && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                <p className="font-medium">
                  Requesting <span className="text-primary font-bold">{watchedQuantity}</span>{' '}
                  {selectedProduct?.unit || ''} of{' '}
                  <span className="font-medium">{selectedProduct?.name || ''}</span>
                </p>
                <p className="text-muted-foreground mt-1">
                  Priority: {priorityLabels[watchedPriority] || watchedPriority}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
