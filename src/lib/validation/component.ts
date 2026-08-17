import { z } from 'zod'

const optionalText = z.string().trim().max(4000).optional().nullable()

export const componentCreateSchema = z.object({
  code: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(240),
  discipline: z.enum(['MECHANICAL', 'ELECTRONICS']),
  description: z.string().trim().min(1).max(8000),
  function: optionalText,
  link: z.string().trim().url().max(2000).optional().nullable().or(z.literal('')),
  optionSelection: optionalText,
  remarks: optionalText,
  unit: z.string().trim().min(1).max(40).optional(),
})

export const componentUpdateSchema = componentCreateSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
})

export function nullIfBlank(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null
}
