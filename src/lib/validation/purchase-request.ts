import { z } from 'zod'

const optionalText = z.string().trim().max(4000).optional().nullable()
const quantity = z.union([z.number().positive(), z.string().trim().regex(/^\d+(\.\d+)?$/)])

export const purchaseRequestCreateSchema = z.object({
  remarks: optionalText,
  lines: z.array(z.object({
    componentId: z.string().min(1),
    type: z.enum(['FOREIGN_STANDARD', 'FOREIGN_MANUFACTURED', 'LOCAL_STANDARD', 'LOCAL_MANUFACTURED']),
    quantity,
    remarks: optionalText,
  })).min(1).max(500),
})

export const purchaseRequestUpdateSchema = z.object({
  provider: optionalText,
  trackingNumber: optionalText,
  boxNumber: optionalText,
  remarks: optionalText,
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const purchaseRequestTransitionSchema = z.object({
  status: z.enum(['PENDING_ORDER_APPROVAL', 'ORDERED', 'SHIPPED']),
})

export const purchaseLinkUpdateSchema = z.object({ quantity })

export const goodsReceiptCreateSchema = z.object({
  receiptNo: z.string().trim().min(1).max(80).optional(),
  provider: optionalText,
  trackingNumber: optionalText,
  boxNumber: optionalText,
  remarks: optionalText,
  lines: z.array(z.object({
    purchaseRequestLineId: z.string().min(1),
    quantity,
    unitCost: z.union([z.number().nonnegative(), z.string().trim().regex(/^\d+(\.\d+)?$/)]).optional(),
    remarks: optionalText,
  })).min(1).max(500),
})
