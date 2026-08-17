'use client'

import { useEffect, useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

const projectSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  departmentId: z.string().min(1, 'Department is required'),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.string(),
})

type ProjectFormValues = z.infer<typeof projectSchema>

export interface Project {
  id: string
  name: string
  code: string
  departmentId: string
  department: { id: string; name: string; code: string }
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  _count: { issues: number; requests: number }
}

interface DeptOption {
  id: string
  name: string
  code: string
  status: string
}

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project | null
  onSuccess: () => void
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSuccess,
}: ProjectFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [startDateOpen, setStartDateOpen] = useState(false)
  const [endDateOpen, setEndDateOpen] = useState(false)

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments')
      if (res.ok) {
        const data = await res.json()
        setDepartments((data.data || []).filter((d: DeptOption) => d.status === 'ACTIVE'))
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (open) fetchDepartments()
  }, [open, fetchDepartments])

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      departmentId: '',
      description: '',
      startDate: '',
      endDate: '',
      status: 'ACTIVE',
    },
  })

  useEffect(() => {
    if (open) {
      if (project) {
        form.reset({
          name: project.name,
          departmentId: project.departmentId,
          description: project.description || '',
          startDate: project.startDate ? project.startDate.split('T')[0] : '',
          endDate: project.endDate ? project.endDate.split('T')[0] : '',
          status: project.status,
        })
      } else {
        form.reset({
          name: '',
          departmentId: '',
          description: '',
          startDate: '',
          endDate: '',
          status: 'ACTIVE',
        })
      }
    }
  }, [open, project, form])

  async function onSubmit(values: ProjectFormValues) {
    setLoading(true)
    try {
      const url = project ? `/api/projects/${project.id}` : '/api/projects'
      const method = project ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (res.ok) {
        onSuccess()
        onOpenChange(false)
      } else {
        const data = await res.json()
        form.setError('root', { message: data.error || 'Operation failed' })
      }
    } catch {
      form.setError('root', { message: 'Network error. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? 'Edit Project' : 'Add New Project'}</DialogTitle>
          <DialogDescription>
            {project
              ? 'Update the project information below.'
              : 'Fill in the details to create a new project.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {form.formState.errors.root && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Office Renovation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {project && (
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">Code</p>
                <p className="text-sm font-mono font-medium">{project.code}</p>
              </div>
            )}

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
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name} ({dept.code})
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Project description..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(new Date(field.value), 'MMM dd, yyyy')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={(date) => {
                            field.onChange(date ? date.toISOString().split('T')[0] : '')
                            setStartDateOpen(false)
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date</FormLabel>
                    <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(new Date(field.value), 'MMM dd, yyyy')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={(date) => {
                            field.onChange(date ? date.toISOString().split('T')[0] : '')
                            setEndDateOpen(false)
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="ON_HOLD">On Hold</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                {project ? 'Update Project' : 'Create Project'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
