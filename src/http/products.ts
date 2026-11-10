import { Router } from 'express'
import { z } from 'zod'
import type { RetailDatabase } from '../db/database.js'
import { requireValue } from './api-error.js'
import { requireAuth, requireRole } from './auth.js'
import { recordAuditEvent } from './audit.js'
import { ApiError } from './api-error.js'

const adjustmentSchema = z.object({
  quantityDelta: z
    .number()
    .int()
    .min(-500)
    .max(500)
    .refine((value) => value !== 0),
  reason: z.string().trim().min(4).max(160),
})

export function createProductsRouter(database: RetailDatabase): Router {
  const router = Router()
  const requireUser = requireAuth(database)

  router.get('/', requireUser, async (request, response) => {
    const user = requireValue(request.user)
    const search = z.string().trim().max(80).catch('').parse(request.query.q)
    const products = await database.query(
      `SELECT id, sku, barcode, name, description, category,
        unit_price_minor AS "unitPriceMinor",
        stock_quantity AS "stockQuantity",
        low_stock_threshold AS "lowStockThreshold",
        image_url AS "imageUrl"
       FROM products
       WHERE store_id = $1 AND (
         $2 = '' OR name ILIKE '%' || $2 || '%' OR sku ILIKE '%' || $2 || '%'
         OR barcode ILIKE '%' || $2 || '%'
       )
       ORDER BY name ASC LIMIT 100`,
      [user.storeId, search],
    )

    response.json({ products: products.rows })
  })

  router.post(
    '/:productId/adjustments',
    requireUser,
    requireRole('supervisor', 'store_admin'),
    async (request, response) => {
      const user = requireValue(request.user)
      const parsed = adjustmentSchema.safeParse(request.body)
      if (!parsed.success) {
        throw new ApiError(400, 'INVALID_ADJUSTMENT', 'Enter a valid stock adjustment and reason')
      }

      const productId = z.string().min(1).max(100).parse(request.params.productId)
      const updatedProduct = await database.transaction(async () => {
        const updated = await database.query<{ stockQuantity: number }>(
          `UPDATE products
         SET stock_quantity = stock_quantity + $1
         WHERE id = $2 AND store_id = $3 AND stock_quantity + $1 >= 0
         RETURNING stock_quantity AS "stockQuantity"`,
          [parsed.data.quantityDelta, productId, user.storeId],
        )

        if (updated.rows.length === 0) {
          throw new ApiError(409, 'STOCK_ADJUSTMENT_REJECTED', 'Product was not found or stock cannot go below zero')
        }

        await database.query(
          `INSERT INTO inventory_movements (
          id, store_id, product_id, actor_id, quantity_delta, reason
        ) VALUES ($1, $2, $3, $4, $5, 'adjustment')`,
          [crypto.randomUUID(), user.storeId, productId, user.id, parsed.data.quantityDelta],
        )
        await recordAuditEvent(database, {
          storeId: user.storeId,
          actorId: user.id,
          eventName: 'inventory.adjusted',
          entityType: 'product',
          entityId: productId,
          metadata: { quantityDelta: parsed.data.quantityDelta },
        })
        return requireValue(updated.rows[0], 'Stock update did not return a product')
      })
      response.json({ stockQuantity: updatedProduct.stockQuantity })
    },
  )

  return router
}
