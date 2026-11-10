import { z } from 'zod'
import type { DemoUser } from './db/database.js'

export const saleItemsSchema = z
  .array(
    z.object({
      productId: z.string().min(1).max(100),
      quantity: z.number().int().min(1).max(100),
    }),
  )
  .min(1)
  .max(100)

export const quoteSchema = z.object({
  items: saleItemsSchema,
  discountBasisPoints: z.number().int().min(0).max(10_000).default(0),
})

export const checkoutSchema = z.object({
  items: saleItemsSchema,
  discountBasisPoints: z.number().int().min(0).max(10_000).default(0),
  tenders: z
    .array(
      z.object({
        kind: z.enum(['cash', 'sandbox']),
        amountMinor: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(4),
})

export const returnSchema = z.object({
  items: z
    .array(
      z.object({
        saleLineId: z.string().min(1).max(100),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(100),
  reason: z.enum(['customer_request', 'damaged', 'other']),
})

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/)

export const maximumDiscountByRole: Record<DemoUser['role'], number> = {
  cashier: 1000,
  supervisor: 5000,
  store_admin: 10_000,
}

export type SaleItems = z.infer<typeof saleItemsSchema>
export type QuoteInput = z.infer<typeof quoteSchema>
export type CheckoutInput = z.infer<typeof checkoutSchema>
export type ReturnInput = z.infer<typeof returnSchema>
