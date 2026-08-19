import { z } from 'zod'

const optionalText = z.string().trim().max(4000).optional().nullable()
const quantity = z.union([z.number().positive(), z.string().trim().regex(/^\d+(\.\d+)?$/)])

const requestItem = z.object({
  projectComponentId: z.string().min(1).optional(),
  componentId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  discipline: z.enum(['MECHANICAL', 'ELECTRONICS']).optional(),
  description: z.string().trim().min(1).max(8000).optional(),
  function: optionalText,
  link: z.string().trim().url().max(2000).optional().nullable().or(z.literal('')),
  optionSelection: optionalText,
  remarks: optionalText,
  quantity: quantity.optional(),
}).superRefine((item, context) => {
  const sourceCount = Number(Boolean(item.projectComponentId)) + Number(Boolean(item.componentId))
  if (sourceCount > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose either a project component or a store component' })
  }
  if (!item.projectComponentId && !item.quantity) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['quantity'], message: 'Quantity is required' })
  }
  if (sourceCount === 0) {
    for (const field of ['title', 'discipline', 'description'] as const) {
      if (!item[field]) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is required` })
    }
  }
})

export const reservationRequestCreateSchema = z.object({
  projectId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  remarks: optionalText,
  items: z.array(requestItem).min(1).max(500),
}).superRefine((value, context) => {
  if (Boolean(value.projectId) === Boolean(value.departmentId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose exactly one destination: project or department' })
  }
  if (!value.projectId && value.items.some((item) => item.projectComponentId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Project components require a project destination' })
  }
})

export const reservationLineReconciliationSchema = z.union([
  z.object({ componentId: z.string().min(1), createComponent: z.never().optional() }),
  z.object({
    componentId: z.never().optional(),
    createComponent: z.object({
      code: z.string().trim().min(1).max(80).optional(),
      unit: z.string().trim().min(1).max(40).optional(),
    }),
  }),
])

export const allocationCreateSchema = z.object({
  quantity,
  remarks: optionalText,
})

export const stockIssueCreateSchema = z.object({
  issueNo: z.string().trim().min(1).max(80).optional(),
  remarks: optionalText,
  lines: z.array(z.object({
    reservationLineId: z.string().min(1),
    quantity,
    remarks: optionalText,
  })).min(1).max(500),
})
