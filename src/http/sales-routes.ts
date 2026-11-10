import { Router } from 'express'
import { z } from 'zod'
import type { RetailDatabase } from '../db/database.js'
import { ApiError, requireValue } from './api-error.js'
import { requireAuth, requireRole } from './auth.js'
import { createReturn } from '../services/returns-service.js'
import {
  assertDiscountAllowed,
  calculateSalePrice,
  createSale,
  loadProductsForCheckout,
  mergeSaleItems,
  requireIdempotencyKey,
  saleDetails,
} from '../services/sales-service.js'
import { checkoutSchema, quoteSchema, returnSchema } from '../sales-schema.js'

export function createSalesRouter(database: RetailDatabase): Router {
  const router = Router()
  const requireUser = requireAuth(database)

  router.get('/', requireUser, async (request, response) => {
    const user = requireValue(request.user)
    const limit = z.coerce.number().int().min(1).max(100).catch(30).parse(request.query.limit)
    const cashierFilter = user.role === 'cashier' ? 'AND cashier_id = $3' : ''
    const params = user.role === 'cashier' ? [user.storeId, limit, user.id] : [user.storeId, limit]
    const result = await database.query(
      `SELECT id, cashier_id AS "cashierId", receipt_number AS "receiptNumber",
        status, subtotal_minor AS "subtotalMinor", discount_minor AS "discountMinor",
        tax_minor AS "taxMinor", total_minor AS "totalMinor", currency,
        created_at AS "createdAt"
       FROM sales WHERE store_id = $1 ${cashierFilter}
       ORDER BY created_at DESC LIMIT $2`,
      params,
    )
    response.json({ sales: result.rows })
  })

  router.post('/quote', requireUser, async (request, response) => {
    const user = requireValue(request.user)
    const parsed = quoteSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'INVALID_QUOTE', 'Review the basket and discount amount')

    assertDiscountAllowed(user, parsed.data.discountBasisPoints)
    const items = mergeSaleItems(parsed.data.items)
    const products = await loadProductsForCheckout(database, user, items)
    const quote = await calculateSalePrice(database, {
      storeId: user.storeId,
      items,
      products,
      discountBasisPoints: parsed.data.discountBasisPoints,
    })
    response.json({ quote })
  })

  router.post('/', requireUser, async (request, response) => {
    const user = requireValue(request.user)
    const parsed = checkoutSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'INVALID_CHECKOUT', 'Review the basket and tender amounts')

    const idempotencyKey = requireIdempotencyKey(request.get('Idempotency-Key'))
    const created = await createSale(database, user, parsed.data, idempotencyKey)
    const sale = await saleDetails(database, created.saleId, user)
    response.status(created.duplicate ? 200 : 201).json({ sale, duplicate: created.duplicate })
  })

  router.get('/:saleId', requireUser, async (request, response) => {
    const user = requireValue(request.user)
    const saleId = z.string().min(1).max(100).parse(request.params.saleId)
    response.json({ sale: await saleDetails(database, saleId, user) })
  })

  router.post('/:saleId/returns', requireUser, requireRole('supervisor', 'store_admin'), async (request, response) => {
    const user = requireValue(request.user)
    const saleId = z.string().min(1).max(100).parse(request.params.saleId)
    const parsed = returnSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'INVALID_RETURN', 'Choose valid items and a return reason')

    const idempotencyKey = requireIdempotencyKey(request.get('Idempotency-Key'))
    const returned = await createReturn({
      database,
      user,
      saleId,
      body: parsed.data,
      idempotencyKey,
    })
    response.status(201).json({ return: returned })
  })

  return router
}
