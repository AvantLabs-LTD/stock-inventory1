'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Check, ChevronRight, ChevronLeft, Package, Building2, User, FolderKanban, Hash, MessageSquare } from 'lucide-react'
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

const issueSchema = z.object({
  departmentId: z.string().min(1, 'Please select a department'),
  employeeName: z.string().min(1, 'Please enter employee name').max(100),
  projectId: z.string().min(1, 'Please select a project'),
  productId: z.string().min(1, 'Please select a product'),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  productionHall: z.string().max(200).optional(),
  remarks: z.string().max(500).optional(),
})

type IssueFormValues = z.infer<typeof issueSchema>

const STEPS = [
  { id: 1, title: 'Department', icon: Building2 },
  { id: 2, title: 'Employee', icon: User },
  { id: 3, title: 'Project', icon: FolderKanban },
  { id: 4, title: 'Product', icon: Package },
  { id: 5, title: 'Quantity', icon: Hash },
  { id: 6, title: 'Remarks', icon: MessageSquare },
]

interface IssueFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function IssueFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: IssueFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [departments, setDepartments] = useState<Department[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [availableStock, setAvailableStock] = useState<number | null>(null)
  const [stockLoading, setStockLoading] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [projectSearch, setProjectSearch] = useState('')

  const form = useForm<IssueFormValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: {
      departmentId: '',
      employeeName: '',
      projectId: '',
      productId: '',
      quantity: 1,
      productionHall: '',
      remarks: '',
    },
    mode: 'onChange',
  })

  const watchedDepartmentId = form.watch('departmentId')
  const watchedProductId = form.watch('productId')
  const watchedQuantity = form.watch('quantity')

  // Load departments when dialog opens
  useEffect(() => {
    if (open) {
      setStep(1)
      form.reset({
        departmentId: '',
        employeeName: '',
        projectId: '',
        productId: '',
        quantity: 1,
        productionHall: '',
        remarks: '',
      })
      setAvailableStock(null)
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
    fetch(`/api/projects?limit=200&departmentId=${watchedDepartmentId}&status=ACTIVE`)
      .then((r) => r.json())
      .then((d) => setProjects(d.data || []))
      .catch(() => {})
    // Clear project when department changes
    form.setValue('projectId', '')
  }, [watchedDepartmentId, form])

  // Fetch available stock when product changes
  useEffect(() => {
    if (!watchedProductId) {
      setAvailableStock(null)
      return
    }
    setStockLoading(true)
    fetch(`/api/stock/summary?productId=${watchedProductId}`)
      .then((r) => r.json())
      .then((d) => setAvailableStock(d.summary?.available ?? 0))
      .catch(() => setAvailableStock(null))
      .finally(() => setStockLoading(false))
  }, [watchedProductId])

  function validateCurrentStep(): boolean {
    const currentField = STEPS[step - 1].title.toLowerCase() as keyof IssueFormValues
    switch (step) {
      case 1:
        return !!watchedDepartmentId
      case 2:
        return !!form.getValues('employeeName').trim()
      case 3:
        return !!form.getValues('projectId')
      case 4:
        return !!watchedProductId
      case 5:
        return watchedQuantity > 0 && (availableStock === null || watchedQuantity <= availableStock)
      case 6:
        return true
      default:
        return true
    }
  }

  function handleNext() {
    // Validate before advancing
    if (step === 1 && !watchedDepartmentId) {
      form.setError('departmentId', { message: 'Please select a department' })
      return
    }
    if (step === 2 && !form.getValues('employeeName').trim()) {
      form.setError('employeeName', { message: 'Please enter employee name' })
      return
    }
    if (step === 3 && !form.getValues('projectId')) {
      form.setError('projectId', { message: 'Please select a project' })
      return
    }
    if (step === 4 && !watchedProductId) {
      form.setError('productId', { message: 'Please select a product' })
      return
    }
    if (step === 5) {
      if (watchedQuantity <= 0) {
        form.setError('quantity', { message: 'Quantity must be at least 1' })
        return
      }
      if (availableStock !== null && watchedQuantity > availableStock) {
        form.setError('quantity', { message: `Quantity exceeds available stock (${availableStock})` })
        return
      }
    }
    if (step < 6) {
      setStep(step + 1)
    }
  }

  function handleBack() {
    if (step > 1) setStep(step - 1)
  }

  async function onSubmit(values: IssueFormValues) {
    setLoading(true)
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (res.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        form.setError('root', { message: data.error || 'Failed to issue inventory' })
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Issue Inventory</DialogTitle>
          <DialogDescription>
            Issue inventory items to a department and project. Follow the steps below.
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-1 py-2 overflow-x-auto">
          {STEPS.map((s, idx) => {
            const StepIcon = s.icon
            const isActive = step === s.id
            const isCompleted = step > s.id
            return (
              <div key={s.id} className="flex items-center">
                <div className={`
                  flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                  ${isActive ? 'bg-primary text-primary-foreground' : isCompleted ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}
                `}>
                  {isCompleted ? (
                    <Check className="size-3" />
                  ) : (
                    <StepIcon className="size-3" />
                  )}
                  <span className="hidden sm:inline">{s.title}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`w-4 h-px mx-0.5 ${step > s.id ? 'bg-primary' : 'bg-border'}`} />
                )}
              </div>
            )
          })}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {form.formState.errors.root && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            {/* Step 1: Department */}
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="size-4 text-primary" />
                  Select Department
                </h3>
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
              </div>
            )}

            {/* Step 2: Employee Name */}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <User className="size-4 text-primary" />
                  Enter Employee Name
                </h3>
                <FormField
                  control={form.control}
                  name="employeeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter the name of the employee receiving items"
                          {...field}
                          autoFocus
                        />
                      </FormControl>
                      <FormMessage />
                      {selectedDepartment && (
                        <p className="text-xs text-muted-foreground">
                          Issuing to: {selectedDepartment.name}
                        </p>
                      )}
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Step 3: Project */}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FolderKanban className="size-4 text-primary" />
                  Select Project
                </h3>
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={watchedDepartmentId ? 'Select project' : 'Select a department first'} />
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
                              No projects found for this department
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
                      {selectedDepartment && (
                        <p className="text-xs text-muted-foreground">
                          Showing projects for: {selectedDepartment.name}
                        </p>
                      )}
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Step 4: Product */}
            {step === 4 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Package className="size-4 text-primary" />
                  Select Product
                </h3>
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
              </div>
            )}

            {/* Step 5: Quantity */}
            {step === 5 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Hash className="size-4 text-primary" />
                  Enter Quantity
                </h3>

                {/* Stock Info Card */}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Product</p>
                      <p className="text-sm font-medium">{selectedProduct?.name || '—'}</p>
                      <p className="text-xs font-mono text-muted-foreground">{selectedProduct?.code}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Available Stock</p>
                      {stockLoading ? (
                        <div className="flex items-center gap-1">
                          <Loader2 className="size-3 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Loading...</span>
                        </div>
                      ) : (
                        <p className={`text-2xl font-bold ${availableStock !== null && availableStock <= 0 ? 'text-red-500' : availableStock !== null && availableStock <= (selectedProduct ? 5 : 0) ? 'text-amber-500' : 'text-green-600'}`}>
                          {availableStock !== null ? availableStock : '—'}
                          <span className="text-xs font-normal text-muted-foreground ml-1">{selectedProduct?.unit || ''}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity * ({selectedProduct?.unit || 'units'})</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max={availableStock ?? undefined}
                          {...field}
                          autoFocus
                        />
                      </FormControl>
                      <FormMessage />
                      {availableStock !== null && watchedQuantity > availableStock && (
                        <p className="text-xs text-red-500">
                          ⚠ Quantity exceeds available stock ({availableStock} {selectedProduct?.unit})
                        </p>
                      )}
                    </FormItem>
                  )}
                />

                {/* Summary preview */}
                {watchedQuantity > 0 && availableStock !== null && watchedQuantity <= availableStock && (
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                    <p className="font-medium">
                      Issuing <span className="text-primary font-bold">{watchedQuantity}</span> {selectedProduct?.unit} of{' '}
                      <span className="font-medium">{selectedProduct?.name}</span>
                    </p>
                    <p className="text-muted-foreground mt-1">
                      To: {selectedDepartment?.name} → {selectedProject?.name} ({form.getValues('employeeName')})
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 6: Remarks */}
            {step === 6 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="size-4 text-primary" />
                  Remarks (Optional)
                </h3>

                {/* Final Summary */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <h4 className="text-sm font-semibold">Issue Summary</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Department</p>
                      <p className="font-medium">{selectedDepartment?.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Project</p>
                      <p className="font-medium">{selectedProject?.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Employee</p>
                      <p className="font-medium">{form.getValues('employeeName')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Product</p>
                      <p className="font-medium">{selectedProduct?.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Quantity</p>
                      <p className="font-medium text-primary">{watchedQuantity} {selectedProduct?.unit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Available After Issue</p>
                      <p className={`font-medium ${availableStock !== null && (availableStock - watchedQuantity) <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {availableStock !== null ? availableStock - watchedQuantity : '—'} {selectedProduct?.unit}
                      </p>
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="productionHall"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Production Hall</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Hall A, Line 3"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any additional notes about this issue..."
                          className="resize-none"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Navigation */}
            <DialogFooter className="flex-row gap-2 sm:justify-between">
              <div>
                {step > 1 && (
                  <Button type="button" variant="outline" onClick={handleBack}>
                    <ChevronLeft className="mr-1 size-4" />
                    Back
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                {step < 6 ? (
                  <Button type="button" onClick={handleNext}>
                    Next
                    <ChevronRight className="ml-1 size-4" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Issue Inventory
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
